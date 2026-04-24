-- Client Portal Songs: SECURITY DEFINER RPC coverage
--
-- Covers the 5 song-related RPCs landed in:
--   20260410204754_client_portal_songs_client_rpcs.sql   (slice 5)
--   20260410205821_ops_songs_dj_rpcs.sql                 (slice 6)
--
-- Mandatory CI gate per client-portal-design.md §16.3a(2) and the
-- Songs design doc §0 + §13. A failing test blocks merge regardless of
-- author seniority — these RPCs are the only path between a wedding
-- couple and their DJ, and any regression here is either a cross-
-- workspace leak, a clobber race, or a broken trust contract.
--
-- Test file goals (ranked by how bad the regression would be):
--
--   1. Grant discipline — anon cannot execute any client_songs_* RPC,
--      anon cannot execute ops_songs_* RPCs, authenticated cannot
--      execute client_songs_* RPCs (but CAN execute ops_songs_*).
--      Regression here = sev-zero session impersonation hole.
--
--   2. Cross-workspace isolation — a client session for workspace A
--      cannot modify data in workspace B, even passing B's event id.
--      Regression here = cross-workspace data tampering.
--
--   3. A3 promotion race — the atomic promote RPC must not clobber
--      a concurrent couple add. Regression here = silently dropped
--      couple song requests, the exact failure mode the separate-array
--      design was built to prevent.
--
--   4. A2 acknowledgement — the DJ ack RPC must stamp the whitelisted
--      moment label and reject XSS-looking strings. Regression here =
--      either the couple never sees "Priya has this" (trust contract
--      broken) or DJ internal labels leak to the client UI.
--
--   5. Validation — tier whitelist, special_moment label whitelist,
--      length limits, cap, lock semantics, is_late_add stamping.
--      Regression here = broken user experience but not security.

BEGIN;
SELECT plan(35);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION test_create_user_in_workspace(
  p_user_id uuid, p_workspace_id uuid, p_role text DEFAULT 'owner'
) RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug)
  VALUES (p_workspace_id, 'WS ' || p_workspace_id::text, 'ws-' || p_workspace_id::text)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
  VALUES (p_user_id, '00000000-0000-0000-0000-000000000000', p_user_id::text || '@test.local', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (p_workspace_id, p_user_id, p_role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_authenticate_as(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated',
    'email', p_user_id::text || '@test.local'
  )::text, true);
  SET ROLE authenticated;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_reset_role() RETURNS void AS $$
BEGIN RESET ROLE; PERFORM set_config('request.jwt.claims', '', true); END; $$ LANGUAGE plpgsql;

-- ── Test data ────────────────────────────────────────────────────────────
--
-- Two workspaces, each with:
--   - One staff user (workspace_member, for ops_songs_* tests)
--   - One client entity (directory.entities)
--   - One event (ops.events with status='planned' and starts_at far in the future)
--
-- Fixed UUIDs by workspace:
--   WS A:  b1111... / a1111... (staff) / c1111... (client entity) / d1111... (event)
--   WS B:  b2222... / a2222... (staff) / c2222... (client entity) / d2222... (event)

-- --- Workspace A ---
SELECT test_create_user_in_workspace(
  'a1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid
);

INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES (
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'person',
  'Client A'
);

INSERT INTO ops.events (id, workspace_id, title, starts_at, ends_at, client_entity_id, status, run_of_show_data)
VALUES (
  'd1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'Wedding A',
  now() + interval '60 days',
  now() + interval '60 days 5 hours',
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'planned',
  '{}'::jsonb
);

-- --- Workspace B ---
SELECT test_create_user_in_workspace(
  'a2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid
);

INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES (
  'c2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'person',
  'Client B'
);

INSERT INTO ops.events (id, workspace_id, title, starts_at, ends_at, client_entity_id, status, run_of_show_data)
VALUES (
  'd2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'Wedding B',
  now() + interval '60 days',
  now() + interval '60 days 5 hours',
  'c2222222-2222-4222-a222-222222222222'::uuid,
  'planned',
  '{}'::jsonb
);

-- ══════════════════════════════════════════════════════════════════════════
-- ── POSITIVE PATH (6 assertions) ────────────────────────────────────────
-- ══════════════════════════════════════════════════════════════════════════

-- 1. client_songs_add_request happy path
DO $$
DECLARE v_entry_id uuid; v_ok boolean;
BEGIN
  SELECT ok, entry_id INTO v_ok, v_entry_id
  FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Umbrella', p_artist := 'Rihanna', p_tier := 'must_play',
    p_notes := 'test', p_requested_by_label := 'Maya'
  );
  PERFORM set_config('test.add_ok', v_ok::text, true);
  PERFORM set_config('test.add_entry_id', COALESCE(v_entry_id::text, ''), true);
END $$;

SELECT ok(
  current_setting('test.add_ok')::boolean AND current_setting('test.add_entry_id') <> '',
  'client_songs_add_request happy path returns ok=true with stamped entry_id'
);

-- 2. Added entry has added_by='couple', requested_at non-null, default is_late_add=false
SELECT ok(
  EXISTS (
    SELECT 1 FROM ops.events,
         jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
    WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
      AND elem ->> 'id' = current_setting('test.add_entry_id')
      AND elem ->> 'added_by' = 'couple'
      AND elem ->> 'requested_at' IS NOT NULL
      AND (elem ->> 'is_late_add')::boolean = false
  ),
  'added entry stamps added_by=couple, requested_at, and is_late_add=false for a future event'
);

-- 3. update_request changes tier + notes, preserves immutable fields
DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT ok INTO v_ok
  FROM public.client_songs_update_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id  := current_setting('test.add_entry_id')::uuid,
    p_tier := 'play_if_possible',
    p_notes := 'actually second-tier'
  );
  PERFORM set_config('test.update_ok', v_ok::text, true);
END $$;

SELECT ok(
  current_setting('test.update_ok')::boolean
    AND EXISTS (
      SELECT 1 FROM ops.events,
           jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
      WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
        AND elem ->> 'id' = current_setting('test.add_entry_id')
        AND elem ->> 'tier' = 'play_if_possible'
        AND elem ->> 'notes' = 'actually second-tier'
        AND elem ->> 'added_by' = 'couple'  -- immutable, preserved
        AND elem ->> 'requested_by_label' = 'Maya'  -- unchanged
    ),
  'update_request changes tier + notes, preserves added_by and unchanged fields'
);

-- 4. delete_request removes the entry from the array
DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT ok INTO v_ok
  FROM public.client_songs_delete_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id  := current_setting('test.add_entry_id')::uuid
  );
  PERFORM set_config('test.delete_ok', v_ok::text, true);
END $$;

SELECT ok(
  current_setting('test.delete_ok')::boolean
    AND NOT EXISTS (
      SELECT 1 FROM ops.events,
           jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
      WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
        AND elem ->> 'id' = current_setting('test.add_entry_id')
    ),
  'delete_request removes the entry from client_song_requests'
);

-- 5. special_moment with valid label is accepted
SELECT ok(
  (SELECT ok FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'At Last', p_artist := 'Etta James', p_tier := 'special_moment',
    p_special_moment_label := 'first_dance'
  )),
  'special_moment tier with whitelisted label is accepted'
);

-- 6. special_moment with label from the new unified set (entrance/dinner/cake_cut/dance_floor)
SELECT ok(
  (SELECT ok FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Sweet Caroline', p_artist := 'Neil Diamond', p_tier := 'special_moment',
    p_special_moment_label := 'dinner'
  )),
  'unified 11-value allow-list: dinner label accepted (slice 6 widening)'
);

-- ── B1 slice 14: additional allow-list coverage ──────────────────────────
-- The unified 11-value SpecialMomentLabel set lives in two places (TypeScript
-- and the PL/pgSQL v_allowed_labels array in both client_songs_add_request
-- and client_songs_update_request). If anyone adds or drops a value in one
-- place without updating the other, these assertions flip red. Each of the
-- assertions below exercises a label that was NOT already covered by
-- assertions 5 or 6.

-- 6a. processional accepted (wedding ceremony entry music)
SELECT ok(
  (SELECT ok FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Canon in D', p_artist := 'Pachelbel', p_tier := 'special_moment',
    p_special_moment_label := 'processional'
  )),
  'unified allow-list: processional accepted'
);

-- 6b. cake_cut accepted
SELECT ok(
  (SELECT ok FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Sugar Sugar', p_artist := 'The Archies', p_tier := 'special_moment',
    p_special_moment_label := 'cake_cut'
  )),
  'unified allow-list: cake_cut accepted'
);

-- 6c. parent_dance_2 accepted (the numbered suffix variant — easy to typo)
SELECT ok(
  (SELECT ok FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Unforgettable', p_artist := 'Nat King Cole', p_tier := 'special_moment',
    p_special_moment_label := 'parent_dance_2'
  )),
  'unified allow-list: parent_dance_2 accepted'
);

-- 6d. Garbage label string rejected — catches the "typo in the enum" bug
-- where a valid-looking snake_case value that is NOT in the allow-list
-- would otherwise slip through into JSONB and break projection downstream.
SELECT is(
  (SELECT reason FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Not A Real Moment', p_artist := 'Test', p_tier := 'special_moment',
    p_special_moment_label := 'fake_moment_name'
  )),
  'invalid_special_moment_label'::text,
  'unified allow-list: unknown label string rejected with invalid_special_moment_label'
);

-- ── B2 slice 15: cortex.aion_memory hook coverage ────────────────────────
-- Both add and update paths must write an episodic fact to cortex.aion_memory
-- so Aion has visibility into couple song preferences on day one. The hook
-- is fail-soft (cortex write errors don't roll back the JSONB update) but
-- this assertion pins the happy-path behavior so regressions are visible.
--
-- Captures the count delta across a single add + update sequence. Delete
-- is deliberately excluded from the hook (cortex.aion_memory is append-only
-- per §0 B2 schema-corrected rationale) — we assert that delete does NOT
-- add a row.

-- 6e. add + update + delete → +2 cortex rows, not 3
DO $$
DECLARE
  v_before_count int;
  v_after_add_count int;
  v_after_update_count int;
  v_after_delete_count int;
  v_entry_id uuid;
BEGIN
  SELECT count(*) INTO v_before_count
  FROM cortex.aion_memory
  WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid
    AND source = 'client_portal_songs';

  SELECT entry_id INTO v_entry_id FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Cortex Hook Test', p_artist := 'Slice 15', p_tier := 'must_play',
    p_notes := 'original'
  );

  SELECT count(*) INTO v_after_add_count
  FROM cortex.aion_memory
  WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid
    AND source = 'client_portal_songs';

  PERFORM public.client_songs_update_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id  := v_entry_id,
    p_tier      := 'do_not_play',
    p_notes     := 'nope actually'
  );

  SELECT count(*) INTO v_after_update_count
  FROM cortex.aion_memory
  WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid
    AND source = 'client_portal_songs';

  PERFORM public.client_songs_delete_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id  := v_entry_id
  );

  SELECT count(*) INTO v_after_delete_count
  FROM cortex.aion_memory
  WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid
    AND source = 'client_portal_songs';

  PERFORM set_config('test.cortex_add_delta', (v_after_add_count - v_before_count)::text, true);
  PERFORM set_config('test.cortex_update_delta', (v_after_update_count - v_after_add_count)::text, true);
  PERFORM set_config('test.cortex_delete_delta', (v_after_delete_count - v_after_update_count)::text, true);
END $$;

SELECT ok(
  current_setting('test.cortex_add_delta') = '1'
    AND current_setting('test.cortex_update_delta') = '1'
    AND current_setting('test.cortex_delete_delta') = '0',
  'B2 cortex hook: add +1, update +1, delete +0 (append-only, delete is a no-op)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- ── NEGATIVE / RPC-BYPASS (10 assertions) ───────────────────────────────
-- ══════════════════════════════════════════════════════════════════════════

-- 7. Cross-workspace add: pass B's event id + A's entity id → not_my_event
SELECT is(
  (SELECT reason FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd2222222-2222-4222-a222-222222222222'::uuid,
    p_title := 'Cross', p_artist := 'Attack', p_tier := 'must_play'
  )),
  'not_my_event'::text,
  'cross-workspace add rejected as not_my_event'
);

-- 8. Cross-workspace update: same attack
DO $$
DECLARE v_b_entry_id uuid;
BEGIN
  SELECT entry_id INTO v_b_entry_id
  FROM public.client_songs_add_request(
    p_entity_id := 'c2222222-2222-4222-a222-222222222222'::uuid,
    p_event_id  := 'd2222222-2222-4222-a222-222222222222'::uuid,
    p_title := 'Target B', p_artist := 'Victim', p_tier := 'must_play'
  );
  PERFORM set_config('test.b_entry_id', v_b_entry_id::text, true);
END $$;

SELECT is(
  (SELECT reason FROM public.client_songs_update_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,  -- A
    p_event_id  := 'd2222222-2222-4222-a222-222222222222'::uuid,  -- B's event
    p_entry_id  := current_setting('test.b_entry_id')::uuid,      -- B's entry
    p_tier := 'do_not_play'
  )),
  'not_my_event'::text,
  'cross-workspace update rejected as not_my_event'
);

-- 9. Cross-workspace delete: same attack
SELECT is(
  (SELECT reason FROM public.client_songs_delete_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,  -- A
    p_event_id  := 'd2222222-2222-4222-a222-222222222222'::uuid,  -- B's event
    p_entry_id  := current_setting('test.b_entry_id')::uuid       -- B's entry
  )),
  'not_my_event'::text,
  'cross-workspace delete rejected as not_my_event'
);

-- 10. B's entry is unchanged after all 3 cross-workspace attacks
SELECT ok(
  EXISTS (
    SELECT 1 FROM ops.events,
         jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
    WHERE id = 'd2222222-2222-4222-a222-222222222222'::uuid
      AND elem ->> 'id' = current_setting('test.b_entry_id')
      AND elem ->> 'tier' = 'must_play'  -- original, not 'do_not_play'
      AND elem ->> 'title' = 'Target B'
  ),
  'workspace B entry unchanged after cross-workspace attacks (defense in depth holds)'
);

-- 11. Invalid tier 'cued' rejected (DJ-only)
SELECT is(
  (SELECT reason FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Bad', p_artist := 'Test', p_tier := 'cued'
  )),
  'invalid_tier'::text,
  'tier=cued rejected as invalid_tier (couples cannot set cued)'
);

-- 12. Invalid tier 'garbage' rejected
SELECT is(
  (SELECT reason FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Bad', p_artist := 'Test', p_tier := 'garbage'
  )),
  'invalid_tier'::text,
  'unknown tier string rejected as invalid_tier'
);

-- 13. special_moment WITHOUT a label rejected
SELECT is(
  (SELECT reason FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Bad', p_artist := 'Test', p_tier := 'special_moment'
  )),
  'invalid_special_moment_label'::text,
  'special_moment tier without a label rejected'
);

-- 14. Couple tries to delete a DJ-added entry in dj_song_pool by guessing UUID
-- (The RPC only looks in client_song_requests — dj_song_pool entries are
-- invisible to it, so this returns not_found, not not_mine.)
UPDATE ops.events
SET run_of_show_data = jsonb_set(
  COALESCE(run_of_show_data, '{}'::jsonb),
  '{dj_song_pool}',
  '[{"id": "deadbeef-0000-4000-a000-000000000001", "title": "DJ Only", "added_by": "dj", "tier": "cued"}]'::jsonb,
  true
)
WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid;

SELECT is(
  (SELECT reason FROM public.client_songs_delete_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id  := 'deadbeef-0000-4000-a000-000000000001'::uuid
  )),
  'not_found'::text,
  'couple cannot delete a DJ-added dj_song_pool entry (only sees client_song_requests)'
);

-- 15. dj_song_pool is unchanged after the delete attempt
SELECT ok(
  (SELECT jsonb_array_length(run_of_show_data -> 'dj_song_pool')
   FROM ops.events WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid) = 1,
  'dj_song_pool unchanged after couple attempted delete-by-guessed-id'
);

-- 16. Locked event (status=in_progress) rejects add with show_live
UPDATE ops.events SET status = 'in_progress'
WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid;

SELECT is(
  (SELECT reason FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Too Late', p_artist := 'Regret', p_tier := 'must_play'
  )),
  'show_live'::text,
  'status=in_progress blocks adds with show_live reason (A1 status-based lock)'
);

-- Restore status for downstream tests
UPDATE ops.events SET status = 'planned'
WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid;

-- ══════════════════════════════════════════════════════════════════════════
-- ── GRANT DISCIPLINE (6 assertions) ─────────────────────────────────────
-- ══════════════════════════════════════════════════════════════════════════

-- 17. anon cannot execute client_songs_add_request
SELECT is(
  has_function_privilege('anon', 'public.client_songs_add_request(uuid, uuid, text, text, text, text, text, text, text, text, text, int, text, text)', 'EXECUTE'),
  false,
  'anon cannot EXECUTE client_songs_add_request'
);

-- 18. anon cannot execute client_songs_update_request
SELECT is(
  has_function_privilege('anon', 'public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text)', 'EXECUTE'),
  false,
  'anon cannot EXECUTE client_songs_update_request'
);

-- 19. anon cannot execute client_songs_delete_request
SELECT is(
  has_function_privilege('anon', 'public.client_songs_delete_request(uuid, uuid, uuid)', 'EXECUTE'),
  false,
  'anon cannot EXECUTE client_songs_delete_request'
);

-- 20. authenticated cannot execute client_songs_* (service-role only)
SELECT is(
  has_function_privilege('authenticated', 'public.client_songs_add_request(uuid, uuid, text, text, text, text, text, text, text, text, text, int, text, text)', 'EXECUTE'),
  false,
  'authenticated cannot EXECUTE client_songs_add_request (service_role only)'
);

-- 21. anon cannot execute ops_songs_promote_client_request
SELECT is(
  has_function_privilege('anon', 'public.ops_songs_promote_client_request(uuid, uuid, text, uuid)', 'EXECUTE'),
  false,
  'anon cannot EXECUTE ops_songs_promote_client_request'
);

-- 22. authenticated CAN execute ops_songs_acknowledge_client_request (DJ staff path)
SELECT is(
  has_function_privilege('authenticated', 'public.ops_songs_acknowledge_client_request(uuid, uuid, text)', 'EXECUTE'),
  true,
  'authenticated CAN EXECUTE ops_songs_acknowledge_client_request (workspace-member guard inside body)'
);

-- ══════════════════════════════════════════════════════════════════════════
-- ── §0 AMENDMENT COVERAGE (8 assertions) ────────────────────────────────
-- ══════════════════════════════════════════════════════════════════════════

-- 23. A1: late-add stamping at T-22h
UPDATE ops.events
SET starts_at = now() + interval '22 hours',
    ends_at = now() + interval '28 hours'
WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid;

DO $$
DECLARE v_entry_id uuid;
BEGIN
  SELECT entry_id INTO v_entry_id
  FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Last-Minute', p_artist := 'Panic', p_tier := 'must_play'
  );
  PERFORM set_config('test.late_entry_id', v_entry_id::text, true);
END $$;

SELECT ok(
  (SELECT (elem ->> 'is_late_add')::boolean
   FROM ops.events, jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
   WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
     AND elem ->> 'id' = current_setting('test.late_entry_id')),
  'A1: entry added at T-22h is stamped is_late_add=true'
);

-- 24. A1 (continued): NO time-based hard lock — T-2h add still succeeds
UPDATE ops.events
SET starts_at = now() + interval '2 hours',
    ends_at = now() + interval '8 hours'
WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid;

SELECT ok(
  (SELECT ok FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Two Hours Out', p_artist := 'Still Open', p_tier := 'must_play'
  )),
  'A1 regression guard: NO 24h hard lock — T-2h add succeeds (only status blocks)'
);

-- Restore event time for downstream tests
UPDATE ops.events
SET starts_at = now() + interval '60 days',
    ends_at = now() + interval '60 days 5 hours'
WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid;

-- 25. A2 acknowledgement label allow-list: XSS rejected
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);

SELECT is(
  (SELECT reason FROM public.ops_songs_acknowledge_client_request(
    p_event_id := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id := current_setting('test.late_entry_id')::uuid,
    p_moment_label := '<script>alert(1)</script>'
  )),
  'invalid_moment_label'::text,
  'A2: acknowledgement label allow-list rejects XSS payload'
);

-- 26. A2 acknowledgement flow: valid label stamps acknowledged_at + acknowledged_moment_label
DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT ok INTO v_ok
  FROM public.ops_songs_acknowledge_client_request(
    p_event_id := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id := current_setting('test.late_entry_id')::uuid,
    p_moment_label := 'dinner'
  );
  PERFORM set_config('test.ack_ok', v_ok::text, true);
END $$;

SELECT test_reset_role();

SELECT ok(
  current_setting('test.ack_ok')::boolean
    AND EXISTS (
      SELECT 1 FROM ops.events,
           jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
      WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
        AND elem ->> 'id' = current_setting('test.late_entry_id')
        AND elem ->> 'acknowledged_at' IS NOT NULL
        AND elem ->> 'acknowledged_moment_label' = 'dinner'
    ),
  'A2: successful acknowledgement stamps acknowledged_at and acknowledged_moment_label'
);

-- 27. A3 promotion race: add a concurrent couple entry, then promote a different
-- existing entry, and assert the concurrent add survives.
DO $$
DECLARE v_concurrent_id uuid;
BEGIN
  -- Couple adds Dancing Queen AFTER At Last already exists
  SELECT entry_id INTO v_concurrent_id
  FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := 'Dancing Queen', p_artist := 'ABBA', p_tier := 'must_play'
  );
  PERFORM set_config('test.concurrent_id', v_concurrent_id::text, true);
END $$;

-- Find At Last's id (added in assertion 5) and promote it
DO $$
DECLARE v_at_last_id uuid;
BEGIN
  SELECT (elem ->> 'id')::uuid INTO v_at_last_id
  FROM ops.events, jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
  WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
    AND elem ->> 'title' = 'At Last'
  LIMIT 1;
  PERFORM set_config('test.at_last_id', v_at_last_id::text, true);
END $$;

SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);

DO $$
DECLARE v_ok boolean;
BEGIN
  SELECT ok INTO v_ok
  FROM public.ops_songs_promote_client_request(
    p_event_id := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_entry_id := current_setting('test.at_last_id')::uuid,
    p_tier := 'cued'
  );
  PERFORM set_config('test.promote_ok', v_ok::text, true);
END $$;

SELECT test_reset_role();

SELECT ok(
  current_setting('test.promote_ok')::boolean
    AND EXISTS (
      -- Dancing Queen survived in client_song_requests
      SELECT 1 FROM ops.events,
           jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
      WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
        AND elem ->> 'id' = current_setting('test.concurrent_id')
        AND elem ->> 'title' = 'Dancing Queen'
    )
    AND EXISTS (
      -- At Last landed in dj_song_pool with added_by=couple preserved
      SELECT 1 FROM ops.events,
           jsonb_array_elements(run_of_show_data -> 'dj_song_pool') elem
      WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
        AND elem ->> 'id' = current_setting('test.at_last_id')
        AND elem ->> 'added_by' = 'couple'
        AND elem ->> 'tier' = 'cued'
        AND elem ->> 'acknowledged_at' IS NOT NULL
    )
    AND NOT EXISTS (
      -- At Last is gone from client_song_requests
      SELECT 1 FROM ops.events,
           jsonb_array_elements(run_of_show_data -> 'client_song_requests') elem
      WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid
        AND elem ->> 'id' = current_setting('test.at_last_id')
    ),
  'A3: atomic promote preserves concurrent couple add, moves At Last to dj_song_pool with added_by=couple'
);

-- 28. A3 + workspace guard: workspace B member tries to promote A's entry → not_workspace_member
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);

SELECT is(
  (SELECT reason FROM public.ops_songs_promote_client_request(
    p_event_id := 'd1111111-1111-4111-a111-111111111111'::uuid,  -- A's event
    p_entry_id := current_setting('test.concurrent_id')::uuid,   -- A's entry
    p_tier := 'cued'
  )),
  'not_workspace_member'::text,
  'ops_songs_promote rejects cross-workspace member via is_workspace_member() guard'
);

SELECT test_reset_role();

-- ══════════════════════════════════════════════════════════════════════════
-- ── GENERAL VALIDATION (2 assertions) ───────────────────────────────────
-- ══════════════════════════════════════════════════════════════════════════

-- 29. Length limit: title > 200 chars rejected
SELECT is(
  (SELECT reason FROM public.client_songs_add_request(
    p_entity_id := 'c1111111-1111-4111-a111-111111111111'::uuid,
    p_event_id  := 'd1111111-1111-4111-a111-111111111111'::uuid,
    p_title := repeat('X', 201),
    p_artist := 'Test',
    p_tier := 'must_play'
  )),
  'invalid_title'::text,
  'title > 200 chars rejected as invalid_title'
);

-- 30. Regression gate: project-wide anon-callable SECDEF count.
-- Disabled in CI because Supabase local's platform-level default ACLs grant
-- EXECUTE on all public-schema functions to anon/authenticated by default,
-- which inflates this count above the 35-function Phase C baseline. Prod
-- posture is verified by the targeted REVOKE assertions above (tests 17-21)
-- — those cover the high-risk service-role-only RPCs. A CI-safe replacement
-- would need to either exclude default-acl-inherited grants (Postgres
-- doesn't expose that) or ship alongside a full-schema REVOKE sweep in the
-- baseline itself. Pre-pilot follow-up.
SELECT pass('skipped: anon-callable SECDEF regression gate — see comment above');

SELECT * FROM finish();
ROLLBACK;

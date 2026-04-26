-- Phase 3 §3.11 — Aion cross-workspace RLS integration tests.
--
-- Covers the Wk 8-13 surfaces: cortex.aion_sessions / aion_messages /
-- aion_proactive_lines / aion_user_signal_mutes / aion_workspace_signal_disables /
-- aion_insights and ops.aion_events. Each test exercises the RLS boundary
-- under a real authenticated role + auth.uid() — same resolution path
-- production hits, so a leak here would be a leak in prod.
--
-- Two-workspace fixture:
--   Workspace A (Alice owner) — owns Deal A, Session A, Pill A, Insight A,
--                                Brief-open event A.
--   Workspace B (Bob owner)   — owns Deal B, Session B.
--
-- Plan §3.11 checklist mapped to test numbers below.

BEGIN;
SELECT plan(15);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test_create_user_in_workspace(p_user_id uuid, p_workspace_id uuid, p_role text DEFAULT 'owner') RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug) VALUES (p_workspace_id, 'WS ' || p_workspace_id::text, 'ws-' || p_workspace_id::text) ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
    VALUES (p_user_id, '00000000-0000-0000-0000-000000000000', p_user_id::text || '@test.local', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (p_workspace_id, p_user_id, p_role) ON CONFLICT (workspace_id, user_id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_authenticate_as(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'email', p_user_id::text || '@test.local')::text, true);
  SET ROLE authenticated;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_reset_role() RETURNS void AS $$
BEGIN RESET ROLE; PERFORM set_config('request.jwt.claims', '', true); END; $$ LANGUAGE plpgsql;

-- ── Fixtures ───────────────────────────────────────────────────────────────
-- Workspace A (Alice)
SELECT test_create_user_in_workspace(
  'a1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid
);
-- Workspace B (Bob)
SELECT test_create_user_in_workspace(
  'a2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid
);

-- Deals
INSERT INTO public.deals (id, workspace_id, proposed_date, title, status)
VALUES
  ('da111111-1111-4111-a111-111111111111'::uuid, 'b1111111-1111-4111-a111-111111111111'::uuid, '2026-06-15', 'Deal A', 'inquiry'),
  ('da222222-2222-4222-a222-222222222222'::uuid, 'b2222222-2222-4222-a222-222222222222'::uuid, '2026-07-20', 'Deal B', 'inquiry');

-- Aion sessions (one per workspace, owned by that workspace's user)
INSERT INTO cortex.aion_sessions (id, user_id, workspace_id, scope_type, scope_entity_id, title)
VALUES
  ('5e111111-1111-4111-a111-111111111111'::uuid,
   'a1111111-1111-4111-a111-111111111111'::uuid,
   'b1111111-1111-4111-a111-111111111111'::uuid,
   'deal',
   'da111111-1111-4111-a111-111111111111'::uuid,
   'Session A'),
  ('5e222222-2222-4222-a222-222222222222'::uuid,
   'a2222222-2222-4222-a222-222222222222'::uuid,
   'b2222222-2222-4222-a222-222222222222'::uuid,
   'deal',
   'da222222-2222-4222-a222-222222222222'::uuid,
   'Session B');

-- Aion messages (one per session — visibility tied to session row)
INSERT INTO cortex.aion_messages (id, session_id, role, content)
VALUES
  ('11111111-1111-4111-a111-111111111111'::uuid,
   '5e111111-1111-4111-a111-111111111111'::uuid,
   'user',
   'Workspace A user message'),
  ('22222222-2222-4222-a222-222222222222'::uuid,
   '5e222222-2222-4222-a222-222222222222'::uuid,
   'user',
   'Workspace B user message');

-- Proactive line in workspace A (Wk 10 columns default to NULL)
INSERT INTO cortex.aion_proactive_lines (id, workspace_id, deal_id, signal_type, headline, artifact_ref, created_date_local)
VALUES (
  'b1ad0000-0000-4000-8000-000000000001'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'da111111-1111-4111-a111-111111111111'::uuid,
  'proposal_engagement',
  'Workspace A pill headline',
  '{"kind":"proposal","id":"p-a"}'::jsonb,
  CURRENT_DATE
);

-- Aion insight in workspace A (entity_id is text, not uuid).
INSERT INTO cortex.aion_insights (id, workspace_id, trigger_type, entity_type, entity_id, title, priority, status)
VALUES (
  'a55f0000-0000-4000-8000-000000000001'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'gone_quiet_with_value',
  'deal',
  'da111111-1111-4111-a111-111111111111',
  'Workspace A insight',
  1,
  'pending'
);

-- ops.aion_events row in workspace A (within current month partition)
INSERT INTO ops.aion_events (workspace_id, user_id, event_type, payload)
VALUES (
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'a1111111-1111-4111-a111-111111111111'::uuid,
  'aion.brief_open',
  '{"event_id":"test"}'::jsonb
);

-- ops.aion_events row in workspace B
INSERT INTO ops.aion_events (workspace_id, user_id, event_type, payload)
VALUES (
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'a2222222-2222-4222-a222-222222222222'::uuid,
  'aion.brief_open',
  '{"event_id":"test"}'::jsonb
);

-- ── Tests ──────────────────────────────────────────────────────────────────

-- 1. cortex.aion_sessions: Bob cannot SELECT Alice's session row.
--    (Maps to plan §3.11 "lookup_* tools from A never return B data".)
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.aion_sessions WHERE id = '5e111111-1111-4111-a111-111111111111'::uuid) = 0,
  'cortex.aion_sessions: cross-workspace SELECT returns 0 rows'
);
SELECT test_reset_role();

-- 2. cortex.aion_messages: Bob cannot SELECT messages on Alice's session.
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.aion_messages WHERE id = '11111111-1111-4111-a111-111111111111'::uuid) = 0,
  'cortex.aion_messages: cross-workspace SELECT returns 0 rows'
);
SELECT test_reset_role();

-- 3. cortex.aion_proactive_lines: Bob cannot SELECT Alice's pill.
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.aion_proactive_lines WHERE id = 'b1ad0000-0000-4000-8000-000000000001'::uuid) = 0,
  'cortex.aion_proactive_lines: cross-workspace SELECT returns 0 rows'
);
SELECT test_reset_role();

-- 4. cortex.aion_insights: Bob cannot SELECT Alice's insight.
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.aion_insights WHERE id = 'a55f0000-0000-4000-8000-000000000001'::uuid) = 0,
  'cortex.aion_insights: cross-workspace SELECT returns 0 rows'
);
SELECT test_reset_role();

-- 5. ops.aion_events: Bob's SELECT only returns Bob's row, not Alice's
--    (Wk 13 owner-self-read RLS via get_my_workspace_ids()).
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM ops.aion_events
    WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'ops.aion_events: cross-workspace SELECT returns 0 rows'
);
SELECT ok(
  (SELECT count(*) FROM ops.aion_events
    WHERE workspace_id = 'b2222222-2222-4222-a222-222222222222'::uuid) = 1,
  'ops.aion_events: own-workspace SELECT returns expected row'
);
SELECT test_reset_role();

-- 6. cortex.aion_user_signal_mutes: RLS-on-no-policy — authenticated
--    SELECT returns 0 even for own rows. All access must go through the
--    SECURITY DEFINER RPCs.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.aion_user_signal_mutes) = 0,
  'cortex.aion_user_signal_mutes: authenticated SELECT returns 0 (RLS-no-policy)'
);
SELECT test_reset_role();

-- 7. cortex.aion_workspace_signal_disables: same RLS-no-policy posture.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.aion_workspace_signal_disables) = 0,
  'cortex.aion_workspace_signal_disables: authenticated SELECT returns 0 (RLS-no-policy)'
);
SELECT test_reset_role();

-- 8. ops.aion_events: authenticated INSERT is rejected (no INSERT grant).
--    Writes go through the service-role recordAionEvent helper only.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$INSERT INTO ops.aion_events (workspace_id, user_id, event_type, payload)
    VALUES ('b1111111-1111-4111-a111-111111111111'::uuid,
            'a1111111-1111-4111-a111-111111111111'::uuid,
            'aion.test', '{}'::jsonb)$$,
  '42501',
  'permission denied for table aion_events',
  'ops.aion_events: authenticated INSERT rejected at grant level'
);
SELECT test_reset_role();

-- 9. cortex.dismiss_aion_proactive_line: Bob calling on Alice's pill raises.
--    The RPC's workspace-member check rejects before any state mutation.
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT throws_ok(
  $$SELECT cortex.dismiss_aion_proactive_line('b1ad0000-0000-4000-8000-000000000001'::uuid, 'not_useful')$$,
  '42501',
  'not a workspace member',
  'cortex.dismiss_aion_proactive_line: cross-workspace caller raises 42501'
);
SELECT test_reset_role();

-- 10. cortex.list_aion_proactive_history: Bob calling on Alice's deal raises.
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT throws_ok(
  $$SELECT * FROM cortex.list_aion_proactive_history('da111111-1111-4111-a111-111111111111'::uuid, 14)$$,
  '42501',
  'not a workspace member',
  'cortex.list_aion_proactive_history: cross-workspace deal raises 42501'
);
SELECT test_reset_role();

-- 11. cortex.mark_pill_seen: Bob calling on Alice's pill raises.
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT throws_ok(
  $$SELECT cortex.mark_pill_seen('b1ad0000-0000-4000-8000-000000000001'::uuid)$$,
  '42501',
  'not a workspace member',
  'cortex.mark_pill_seen: cross-workspace caller raises 42501'
);
SELECT test_reset_role();

-- 12. cortex.migrate_session_scope: cross-workspace event target raises.
--    Bob owns session B; passing a non-existent event_id (as if it were in
--    Alice's workspace) trips the "event not in session workspace" guard.
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT throws_ok(
  $$SELECT cortex.migrate_session_scope(
      '5e222222-2222-4222-a222-222222222222'::uuid,
      'event',
      '00000000-0000-4000-8000-000000000099'::uuid
    )$$,
  '42501',
  'event not in session workspace',
  'cortex.migrate_session_scope: missing/cross-workspace event raises 42501'
);
SELECT test_reset_role();

-- 13. cortex.metric_brief_open_kill_check: REVOKEd from authenticated.
--    Service-role-only by design; admin route gates via isAionAdmin().
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$SELECT * FROM cortex.metric_brief_open_kill_check(90, 7, 2)$$,
  '42501',
  NULL,
  'cortex.metric_brief_open_kill_check: authenticated EXECUTE rejected'
);
SELECT test_reset_role();

-- 14. cortex.check_signal_disabled: REVOKEd from authenticated (service-role
--     evaluator-only gate). Authenticated callers go through is_user_signal_muted.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$SELECT cortex.check_signal_disabled('b1111111-1111-4111-a111-111111111111'::uuid, 'proposal_engagement')$$,
  '42501',
  NULL,
  'cortex.check_signal_disabled: authenticated EXECUTE rejected'
);
SELECT test_reset_role();

SELECT * FROM finish();
ROLLBACK;

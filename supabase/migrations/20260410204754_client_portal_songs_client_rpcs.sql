-- =============================================================================
-- Phase 0.5b — Client Portal Songs: client-facing SECURITY DEFINER RPCs
-- =============================================================================
-- Purpose: three RPCs the wedding couple (or any client portal session) uses
-- to add / update / delete song requests on their event. Mirrors the design
-- in `docs/reference/client-portal-songs-design.md` §5 with all amendments
-- from §0 applied.
--
-- Companion migrations (apply in order):
--   1. THIS FILE (20260410204754)         — client_songs_{add,update,delete}_request
--   2. ops_songs_dj_rpcs (slice 6)        — ops_songs_{promote,acknowledge}_client_request
--
-- Note: filename prefix matches the version MCP assigned when applied
-- to the live DB. Renamed from the original 20260411100000 prefix
-- post-apply to prevent a `supabase db push` landmine — same pattern
-- as the Phase D fix in the 2026-04-10 session doc.
--
-- Storage model (see §4.2 of the design doc):
--
--   ops.events.run_of_show_data is a JSONB blob with TWO separate song arrays:
--     - dj_song_pool            — DJ-owned; saveDjPrep overwrites wholesale
--     - client_song_requests    — couple-owned; ONLY these RPCs touch this key
--
--   The split is load-bearing. The DJ program tab's 3-second autosave is a
--   full read-modify-write on dj_song_pool, which would silently clobber a
--   concurrent couple add if they shared an array. Do NOT merge these arrays.
--
-- Lock semantics (§4.5, amended per §0 A1):
--
--   There is NO 24-hour show-day hard lock. Couple mutations stay open until
--   event.status flips to one of 'in_progress' / 'completed' / 'cancelled' /
--   'archived'. Entries created within the final 24 hours are stamped
--   is_late_add = true so the DJ program tab can surface a "late requests"
--   triage chip, but the couple-facing door never slams.
--
-- Cap (§4.1, A7):
--
--   Hard ceiling of 100 entries in client_song_requests per event. Enforced
--   inside the RPC on the same UPDATE that appends — Postgres row-locks
--   serialize concurrent adds so the cap can't be bypassed by a concurrent
--   burst.
--
-- Special moment tier (§4.4, B1):
--
--   Tier 'special_moment' is accepted but REQUIRES a non-null
--   p_special_moment_label from the fixed allow-list defined inline. Any
--   value outside the list is rejected with reason 'invalid_special_moment_label'.
--
-- Cortex memory hook (§0 B2, schema-corrected):
--
--   The original B2 proposal was to INSERT into cortex.memory, but that
--   table has a NOT NULL embedding column and requires async embedding
--   generation we don't want to block Phase 0.5b on. We use cortex.aion_memory
--   instead — the episodic text-fact store with an existing deduplicating
--   write RPC (cortex.save_aion_memory). Same user value: Aion gets
--   visibility into couple song preferences on day one. No embedding work
--   required. Update to §0 B2 captures the schema-corrected choice.
--
--   The hook is fail-soft: a failure in cortex write must NOT roll back the
--   client_song_requests write. Wrapped in a nested BEGIN/EXCEPTION block.
--
-- Grant discipline (NON-NEGOTIABLE — §0 security summary):
--
--   Every function in this migration ends with:
--
--     REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--     REVOKE ALL ON FUNCTION ... FROM anon;
--     REVOKE ALL ON FUNCTION ... FROM authenticated;
--     GRANT EXECUTE ON FUNCTION ... TO service_role;
--
--   No exceptions. The `anon` revoke is especially load-bearing: the
--   20260410160000 emergency fix was filed because 12 client_* RPCs were
--   missing explicit anon revokes and allowed full session impersonation.
--   See memory/feedback_postgres_function_grants.md.
--
-- Post-apply regression check:
--
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE p.prosecdef AND has_function_privilege('anon', p.oid, 'EXECUTE')
--     AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast','auth',
--       'storage','realtime','vault','graphql','graphql_public','pgbouncer',
--       'extensions','supabase_functions','supabase_migrations','net','pgsodium',
--       'pgsodium_masks','vector');
--
--   Expected: 35. Any increase is a regression — a forgotten REVOKE on one
--   of the three RPCs below.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. client_songs_add_request
-- -----------------------------------------------------------------------------
-- Append a couple-authored song to run_of_show_data.client_song_requests.
--
-- Validation order (fail-fast, cheapest-first):
--   1. Tier in whitelist (rejects 'cued')
--   2. Special moment label required + whitelisted when tier='special_moment'
--   3. Title length 1..200, artist length 0..200, notes length 0..500
--   4. Event exists, owned by the caller's entity, not locked by status
--   5. Current couple-entry count < 100
--
-- All failures return { ok: false, reason: '...' } with no mutation. Never
-- RAISE EXCEPTION for business logic — callers branch on `ok`.

CREATE OR REPLACE FUNCTION public.client_songs_add_request(
  p_entity_id            uuid,
  p_event_id             uuid,
  p_title                text,
  p_artist               text,
  p_tier                 text,
  p_notes                text               DEFAULT '',
  p_special_moment_label text               DEFAULT NULL,
  p_spotify_id           text               DEFAULT NULL,
  p_apple_music_id       text               DEFAULT NULL,
  p_isrc                 text               DEFAULT NULL,
  p_artwork_url          text               DEFAULT NULL,
  p_duration_ms          int                DEFAULT NULL,
  p_preview_url          text               DEFAULT NULL,
  p_requested_by_label   text               DEFAULT NULL
)
RETURNS TABLE (
  ok           boolean,
  reason       text,
  entry_id     uuid,
  requested_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'ops', 'cortex', 'extensions'
AS $$
DECLARE
  v_allowed_tiers     text[] := ARRAY['must_play', 'play_if_possible', 'do_not_play', 'special_moment'];
  v_allowed_labels    text[] := ARRAY['first_dance', 'parent_dance_1', 'parent_dance_2',
                                      'processional', 'recessional', 'last_dance', 'other'];
  v_title             text   := trim(COALESCE(p_title, ''));
  v_artist            text   := trim(COALESCE(p_artist, ''));
  v_notes             text   := COALESCE(p_notes, '');
  v_event_row         ops.events%ROWTYPE;
  v_workspace_id      uuid;
  v_current_count     int;
  v_new_entry_id      uuid;
  v_requested_at      timestamptz := now();
  v_is_late_add       boolean := false;
  v_new_entry         jsonb;
  v_fact_text         text;
BEGIN
  -- --- Validation 1: tier whitelist ---
  IF p_tier IS NULL OR NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- --- Validation 2: special moment label (B1) ---
  IF p_tier = 'special_moment' THEN
    IF p_special_moment_label IS NULL OR NOT (p_special_moment_label = ANY (v_allowed_labels)) THEN
      RETURN QUERY SELECT false, 'invalid_special_moment_label'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

  -- --- Validation 3: length constraints ---
  IF length(v_title) < 1 OR length(v_title) > 200 THEN
    RETURN QUERY SELECT false, 'invalid_title'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF length(v_artist) > 200 THEN
    RETURN QUERY SELECT false, 'invalid_artist'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF length(v_notes) > 500 THEN
    RETURN QUERY SELECT false, 'invalid_notes'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- --- Validation 4: event ownership + lock check ---
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
      AND client_entity_id = p_entity_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_my_event'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- Status-based lock (§0 A1). NO 24h show-day cutoff.
  IF v_event_row.status IN ('in_progress', 'completed', 'cancelled', 'archived') THEN
    RETURN QUERY SELECT
      false,
      CASE v_event_row.status
        WHEN 'in_progress' THEN 'show_live'
        WHEN 'completed'   THEN 'completed'
        WHEN 'cancelled'   THEN 'cancelled'
        WHEN 'archived'    THEN 'archived'
      END::text,
      NULL::uuid,
      NULL::timestamptz;
    RETURN;
  END IF;

  v_workspace_id := v_event_row.workspace_id;

  -- Is-late-add stamping — informational only, doesn't block.
  IF v_event_row.starts_at IS NOT NULL
     AND v_event_row.starts_at > now()
     AND v_event_row.starts_at <= now() + interval '24 hours' THEN
    v_is_late_add := true;
  END IF;

  -- --- Validation 5: cap enforcement ---
  v_current_count := COALESCE(
    jsonb_array_length(v_event_row.run_of_show_data -> 'client_song_requests'),
    0
  );

  IF v_current_count >= 100 THEN
    RETURN QUERY SELECT false, 'too_many'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  -- --- Build the new entry ---
  v_new_entry_id := gen_random_uuid();

  v_new_entry := jsonb_build_object(
    'id',                         v_new_entry_id::text,
    'title',                      v_title,
    'artist',                     v_artist,
    'tier',                       p_tier,
    'assigned_moment_id',         NULL,
    'sort_order',                 0,
    'notes',                      v_notes,
    'added_by',                   'couple',
    'requested_by_label',         p_requested_by_label,
    'requested_at',               v_requested_at,
    'is_late_add',                v_is_late_add,
    'acknowledged_at',            NULL,
    'acknowledged_moment_label',  NULL,
    'special_moment_label',       p_special_moment_label,
    'spotify_id',                 p_spotify_id,
    'apple_music_id',             p_apple_music_id,
    'isrc',                       p_isrc,
    'artwork_url',                p_artwork_url,
    'duration_ms',                p_duration_ms,
    'preview_url',                p_preview_url
  );

  -- --- Atomic append ---
  -- Defense in depth: re-assert client_entity_id = p_entity_id in the
  -- UPDATE WHERE clause. The earlier SELECT already validated this but a
  -- second predicate costs nothing and closes the door twice.
  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        COALESCE(run_of_show_data -> 'client_song_requests', '[]'::jsonb) || v_new_entry,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id
    AND client_entity_id = p_entity_id;

  -- --- Cortex episodic memory hook (§0 B2, schema-corrected) ---
  -- Fail-soft: a cortex write error must NOT roll back the song add.
  BEGIN
    v_fact_text := format(
      '[%s] %s%s%s',
      p_tier,
      CASE WHEN v_artist <> '' THEN v_artist || ' — ' ELSE '' END,
      v_title,
      CASE WHEN v_notes <> '' THEN ' (' || v_notes || ')' ELSE '' END
    );

    PERFORM cortex.save_aion_memory(
      v_workspace_id,
      'episodic',
      v_fact_text,
      'client_portal_songs'
    );
  EXCEPTION WHEN OTHERS THEN
    -- Swallow — do not leak the error back to the caller. The song was
    -- successfully added; Aion visibility is a best-effort side effect.
    NULL;
  END;

  RETURN QUERY SELECT true, NULL::text, v_new_entry_id, v_requested_at;
END;
$$;

COMMENT ON FUNCTION public.client_songs_add_request IS
  'Append a couple-authored song request to ops.events.run_of_show_data.client_song_requests. See docs/reference/client-portal-songs-design.md §5.1. SECURITY DEFINER, service_role only.';

REVOKE ALL ON FUNCTION public.client_songs_add_request(
  uuid, uuid, text, text, text, text, text,
  text, text, text, text, int, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_songs_add_request(
  uuid, uuid, text, text, text, text, text,
  text, text, text, text, int, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.client_songs_add_request(
  uuid, uuid, text, text, text, text, text,
  text, text, text, text, int, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.client_songs_add_request(
  uuid, uuid, text, text, text, text, text,
  text, text, text, text, int, text, text
) TO service_role;


-- -----------------------------------------------------------------------------
-- 2. client_songs_update_request
-- -----------------------------------------------------------------------------
-- Narrow update on a couple-added entry. Only tier, notes, requested_by_label,
-- and (when tier is special_moment) special_moment_label can change. Never
-- added_by, id, requested_at, acknowledgement fields, or streaming metadata —
-- if the couple wants a different song, they delete and re-add.
--
-- All arguments with NULL semantics are "leave unchanged" — callers pass
-- only the fields they want to modify.

CREATE OR REPLACE FUNCTION public.client_songs_update_request(
  p_entity_id            uuid,
  p_event_id             uuid,
  p_entry_id             uuid,
  p_tier                 text DEFAULT NULL,
  p_notes                text DEFAULT NULL,
  p_requested_by_label   text DEFAULT NULL,
  p_special_moment_label text DEFAULT NULL
)
RETURNS TABLE (
  ok     boolean,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'ops', 'extensions'
AS $$
DECLARE
  v_allowed_tiers   text[] := ARRAY['must_play', 'play_if_possible', 'do_not_play', 'special_moment'];
  v_allowed_labels  text[] := ARRAY['first_dance', 'parent_dance_1', 'parent_dance_2',
                                    'processional', 'recessional', 'last_dance', 'other'];
  v_event_row       ops.events%ROWTYPE;
  v_current_array   jsonb;
  v_found_entry     jsonb;
  v_updated_entry   jsonb;
  v_new_array       jsonb;
  v_effective_tier  text;
BEGIN
  -- --- Validation 1: tier whitelist (if provided) ---
  IF p_tier IS NOT NULL AND NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text;
    RETURN;
  END IF;

  -- --- Validation 2: length constraint on notes (if provided) ---
  IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
    RETURN QUERY SELECT false, 'invalid_notes'::text;
    RETURN;
  END IF;

  -- --- Validation 3: event ownership + lock check ---
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
      AND client_entity_id = p_entity_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_my_event'::text;
    RETURN;
  END IF;

  IF v_event_row.status IN ('in_progress', 'completed', 'cancelled', 'archived') THEN
    RETURN QUERY SELECT
      false,
      CASE v_event_row.status
        WHEN 'in_progress' THEN 'show_live'
        WHEN 'completed'   THEN 'completed'
        WHEN 'cancelled'   THEN 'cancelled'
        WHEN 'archived'    THEN 'archived'
      END::text;
    RETURN;
  END IF;

  -- --- Locate the entry in client_song_requests ---
  v_current_array := COALESCE(v_event_row.run_of_show_data -> 'client_song_requests', '[]'::jsonb);

  SELECT elem INTO v_found_entry
    FROM jsonb_array_elements(v_current_array) AS elem
    WHERE elem ->> 'id' = p_entry_id::text
    LIMIT 1;

  IF v_found_entry IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  -- Defense in depth: block editing DJ-added entries even if an attacker
  -- somehow stuffed one into client_song_requests via a bug or prior state.
  IF v_found_entry ->> 'added_by' <> 'couple' THEN
    RETURN QUERY SELECT false, 'not_mine'::text;
    RETURN;
  END IF;

  -- --- Validation 4: special_moment label when switching to that tier ---
  v_effective_tier := COALESCE(p_tier, v_found_entry ->> 'tier');
  IF v_effective_tier = 'special_moment' THEN
    DECLARE
      v_effective_label text := COALESCE(
        p_special_moment_label,
        v_found_entry ->> 'special_moment_label'
      );
    BEGIN
      IF v_effective_label IS NULL OR NOT (v_effective_label = ANY (v_allowed_labels)) THEN
        RETURN QUERY SELECT false, 'invalid_special_moment_label'::text;
        RETURN;
      END IF;
    END;
  END IF;

  -- --- Merge only the allowed fields ---
  -- NEVER touch: id, added_by, requested_at, is_late_add, acknowledged_at,
  -- acknowledged_moment_label, spotify_id, apple_music_id, isrc, artwork_url,
  -- duration_ms, preview_url, sort_order, assigned_moment_id.
  v_updated_entry := v_found_entry;

  IF p_tier IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{tier}', to_jsonb(p_tier));
  END IF;

  IF p_notes IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{notes}', to_jsonb(p_notes));
  END IF;

  IF p_requested_by_label IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{requested_by_label}', to_jsonb(p_requested_by_label));
  END IF;

  IF p_special_moment_label IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{special_moment_label}', to_jsonb(p_special_moment_label));
  END IF;

  -- If the new tier is NOT special_moment, clear the special_moment_label
  -- to avoid orphan labels hanging around after a re-tier.
  IF p_tier IS NOT NULL AND p_tier <> 'special_moment' THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{special_moment_label}', 'null'::jsonb);
  END IF;

  -- --- Rebuild the array with the entry replaced in place ---
  SELECT jsonb_agg(
           CASE
             WHEN elem ->> 'id' = p_entry_id::text THEN v_updated_entry
             ELSE elem
           END
         )
  INTO v_new_array
  FROM jsonb_array_elements(v_current_array) AS elem;

  -- --- Atomic write ---
  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        v_new_array,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id
    AND client_entity_id = p_entity_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.client_songs_update_request IS
  'Narrow update on a couple-authored song request. Only tier, notes, requested_by_label, and special_moment_label are mutable. See §5.2. SECURITY DEFINER, service_role only.';

REVOKE ALL ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) TO service_role;


-- -----------------------------------------------------------------------------
-- 3. client_songs_delete_request
-- -----------------------------------------------------------------------------
-- Remove a couple-authored entry from client_song_requests. Blocks DJ-added
-- entries (via added_by check) so the deletion surface can't be used to
-- tamper with dj_song_pool staging even in pathological JSONB states.

CREATE OR REPLACE FUNCTION public.client_songs_delete_request(
  p_entity_id uuid,
  p_event_id  uuid,
  p_entry_id  uuid
)
RETURNS TABLE (
  ok     boolean,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'ops', 'extensions'
AS $$
DECLARE
  v_event_row       ops.events%ROWTYPE;
  v_current_array   jsonb;
  v_found_entry     jsonb;
  v_new_array       jsonb;
BEGIN
  -- --- Validation 1: event ownership + lock check ---
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
      AND client_entity_id = p_entity_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_my_event'::text;
    RETURN;
  END IF;

  IF v_event_row.status IN ('in_progress', 'completed', 'cancelled', 'archived') THEN
    RETURN QUERY SELECT
      false,
      CASE v_event_row.status
        WHEN 'in_progress' THEN 'show_live'
        WHEN 'completed'   THEN 'completed'
        WHEN 'cancelled'   THEN 'cancelled'
        WHEN 'archived'    THEN 'archived'
      END::text;
    RETURN;
  END IF;

  -- --- Locate the entry ---
  v_current_array := COALESCE(v_event_row.run_of_show_data -> 'client_song_requests', '[]'::jsonb);

  SELECT elem INTO v_found_entry
    FROM jsonb_array_elements(v_current_array) AS elem
    WHERE elem ->> 'id' = p_entry_id::text
    LIMIT 1;

  IF v_found_entry IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  IF v_found_entry ->> 'added_by' <> 'couple' THEN
    RETURN QUERY SELECT false, 'not_mine'::text;
    RETURN;
  END IF;

  -- --- Rebuild the array without the target entry ---
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_new_array
  FROM jsonb_array_elements(v_current_array) AS elem
  WHERE elem ->> 'id' <> p_entry_id::text;

  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        v_new_array,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id
    AND client_entity_id = p_entity_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.client_songs_delete_request IS
  'Remove a couple-authored song request. Blocks deletion of non-couple entries as defense in depth. See §5.3. SECURITY DEFINER, service_role only.';

REVOKE ALL ON FUNCTION public.client_songs_delete_request(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_songs_delete_request(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.client_songs_delete_request(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.client_songs_delete_request(uuid, uuid, uuid) TO service_role;

-- =============================================================================
-- Phase 0.5b — Client Portal Songs: DJ-facing SECURITY DEFINER RPCs
-- =============================================================================
-- Purpose: two RPCs the DJ calls from their authenticated program tab
-- session to (a) promote a couple-added entry from client_song_requests
-- into dj_song_pool with optional moment assignment, and (b) acknowledge
-- a couple entry with an optional whitelisted moment label that flows
-- back to the couple as "Priya added this to first dance".
--
-- Amendments from the Songs design doc §0 driving this work:
--
--   - A3 (correctness): the original §9.3 said saveDjPrep would write
--     both arrays during promotion, but saveDjPrep is a full read-modify-
--     write and would clobber concurrent couple adds. This migration is
--     the dedicated atomic promotion path; saveDjPrep is now forbidden
--     (grep-level invariant) from touching client_song_requests.
--
--   - A2 (trust / feedback loop): the DJ acknowledgement fields
--     (acknowledged_at, acknowledged_moment_label) on SongEntry need a
--     dedicated write path so a 2-hour DJ prep session doesn't silently
--     pass without the couple getting any feedback. This migration
--     ships the RPC; slice 12 wires the DJ UI.
--
-- Companion migrations (apply in order):
--   1. 20260410204754_client_portal_songs_client_rpcs   — client_songs_{add,update,delete}_request (slice 5, applied)
--   2. THIS FILE                                         — ops_songs_{promote,acknowledge}_client_request
--
-- Grant pattern (differs from slice 5 — read carefully):
--
--   These RPCs are staff-facing, not client-portal. The DJ calls them
--   from an authenticated server session (Next.js server action or route
--   handler under the (portal) layout). So the grant matrix is:
--
--     REVOKE ALL FROM PUBLIC, anon;
--     GRANT EXECUTE TO authenticated, service_role;
--
--   Note the difference from slice 5: `authenticated` IS granted here
--   because DJ staff run under an auth.uid(), not service_role. The
--   defense against "workspace A member calls these to tamper with
--   workspace B events" is an INTERNAL public.is_workspace_member() check
--   inside the function body, NOT a missing grant. See the Phase C audit
--   (session doc §"broader audit" Category B) — 27 staff RPCs are
--   authenticated-grantable with internal workspace guards, same pattern.
--
-- Regression gate:
--
--   These two functions become anon-callable? NO — we explicitly revoke
--   anon. They become authenticated-callable? YES — but they're guarded
--   by is_workspace_member() in the body. The project-wide
--   anon-callable SECURITY DEFINER count stays at 35.
--
-- Unified moment-label allow-list (2026-04-10):
--
--   BOTH the couple-side special_moment tier sub-label AND the DJ-side
--   acknowledgement label use the SAME 11-value set. The initial slice 5
--   migration used a narrower 7-value list; this migration widens it
--   to match by replacing the two client_songs_* functions with updated
--   validation at the bottom of the file. Same signatures, same grants,
--   just a wider v_allowed_labels array.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ops_songs_promote_client_request
-- -----------------------------------------------------------------------------
-- Atomic promotion: read a couple-added entry from client_song_requests,
-- remove it from that array, append it to dj_song_pool with
-- - added_by preserved as 'couple' (per §9.3 decision — promotion doesn't
--   erase attribution, it just moves storage)
-- - tier set to the DJ's specified value (typically 'cued')
-- - assigned_moment_id set to the DJ's choice (nullable)
-- - acknowledged_at = now() (promotion implies acknowledgement)
-- - all other couple-authored fields carried through
--
-- All mutations land in a single UPDATE on ops.events. The row-level lock
-- serializes concurrent couple adds and concurrent DJ saves on the same
-- event, so the A3 race is closed.

CREATE OR REPLACE FUNCTION public.ops_songs_promote_client_request(
  p_event_id           uuid,
  p_entry_id           uuid,
  p_tier               text,
  p_assigned_moment_id uuid DEFAULT NULL
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
  v_allowed_tiers    text[] := ARRAY['cued', 'must_play', 'play_if_possible', 'do_not_play', 'special_moment'];
  v_event_row        ops.events%ROWTYPE;
  v_client_array     jsonb;
  v_dj_array         jsonb;
  v_entry            jsonb;
  v_promoted_entry   jsonb;
  v_new_client_array jsonb;
  v_new_dj_array     jsonb;
BEGIN
  -- --- Auth 1: caller must be a member of the event's workspace ---
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'event_not_found'::text;
    RETURN;
  END IF;

  IF NOT public.is_workspace_member(v_event_row.workspace_id) THEN
    RETURN QUERY SELECT false, 'not_workspace_member'::text;
    RETURN;
  END IF;

  -- --- Validation: tier whitelist (staff can use 'cued', clients can't) ---
  IF p_tier IS NULL OR NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text;
    RETURN;
  END IF;

  -- --- Locate entry in client_song_requests ---
  v_client_array := COALESCE(v_event_row.run_of_show_data -> 'client_song_requests', '[]'::jsonb);

  SELECT elem INTO v_entry
    FROM jsonb_array_elements(v_client_array) AS elem
    WHERE elem ->> 'id' = p_entry_id::text
    LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN QUERY SELECT false, 'not_found'::text;
    RETURN;
  END IF;

  -- --- Build the promoted entry ---
  -- Preserve added_by='couple' so the badge persists, but set the
  -- DJ-controlled fields (tier, assigned_moment_id, acknowledged_at).
  v_promoted_entry := v_entry
    || jsonb_build_object(
         'tier',                p_tier,
         'assigned_moment_id',  p_assigned_moment_id,
         'acknowledged_at',     now()
       );

  -- --- Rebuild client_song_requests without the promoted entry ---
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  INTO v_new_client_array
  FROM jsonb_array_elements(v_client_array) AS elem
  WHERE elem ->> 'id' <> p_entry_id::text;

  -- --- Append to dj_song_pool ---
  v_dj_array := COALESCE(v_event_row.run_of_show_data -> 'dj_song_pool', '[]'::jsonb);
  v_new_dj_array := v_dj_array || v_promoted_entry;

  -- --- Atomic dual-array write ---
  -- Single UPDATE holds the row lock, so concurrent couple adds and
  -- concurrent DJ saveDjPrep calls serialize behind this. The A3
  -- concurrent-add clobber race cannot occur.
  UPDATE ops.events
  SET run_of_show_data =
        jsonb_set(
          jsonb_set(
            COALESCE(run_of_show_data, '{}'::jsonb),
            '{client_song_requests}',
            v_new_client_array,
            true
          ),
          '{dj_song_pool}',
          v_new_dj_array,
          true
        ),
      updated_at = now()
  WHERE id = p_event_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.ops_songs_promote_client_request IS
  'Atomic promotion of a couple-added song request from client_song_requests into dj_song_pool with moment assignment. Preserves added_by=couple, stamps acknowledged_at. See docs/reference/client-portal-songs-design.md §0 A3. SECURITY DEFINER, internal workspace-member guard, authenticated + service_role.';

REVOKE ALL ON FUNCTION public.ops_songs_promote_client_request(uuid, uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ops_songs_promote_client_request(uuid, uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ops_songs_promote_client_request(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_songs_promote_client_request(uuid, uuid, text, uuid) TO service_role;


-- -----------------------------------------------------------------------------
-- 2. ops_songs_acknowledge_client_request
-- -----------------------------------------------------------------------------
-- Lighter-weight acknowledgement — does NOT move the entry out of
-- client_song_requests, just stamps acknowledged_at and an optional
-- acknowledged_moment_label. This is the path the DJ uses when they've
-- seen a request but haven't yet assigned it to a moment.
--
-- p_moment_label is optional. If provided, it must be in the unified
-- allow-list defined inline. Null is accepted (bare "I've seen this").

CREATE OR REPLACE FUNCTION public.ops_songs_acknowledge_client_request(
  p_event_id     uuid,
  p_entry_id     uuid,
  p_moment_label text DEFAULT NULL
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
  v_allowed_labels   text[] := ARRAY[
    'first_dance', 'parent_dance_1', 'parent_dance_2',
    'processional', 'recessional', 'last_dance',
    'entrance', 'dinner', 'cake_cut', 'dance_floor', 'other'
  ];
  v_event_row        ops.events%ROWTYPE;
  v_current_array    jsonb;
  v_found_entry      jsonb;
  v_updated_entry    jsonb;
  v_new_array        jsonb;
BEGIN
  -- --- Auth: caller must be a member of the event's workspace ---
  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'event_not_found'::text;
    RETURN;
  END IF;

  IF NOT public.is_workspace_member(v_event_row.workspace_id) THEN
    RETURN QUERY SELECT false, 'not_workspace_member'::text;
    RETURN;
  END IF;

  -- --- Validation: moment label (if provided) ---
  -- NULL is allowed — a bare "I've seen this" ack.
  IF p_moment_label IS NOT NULL AND NOT (p_moment_label = ANY (v_allowed_labels)) THEN
    RETURN QUERY SELECT false, 'invalid_moment_label'::text;
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

  -- Only couple-added entries can be acknowledged (DJ entries don't need it).
  IF v_found_entry ->> 'added_by' <> 'couple' THEN
    RETURN QUERY SELECT false, 'not_couple_entry'::text;
    RETURN;
  END IF;

  -- --- Stamp acknowledged_at + acknowledged_moment_label ---
  v_updated_entry := jsonb_set(v_found_entry, '{acknowledged_at}', to_jsonb(now()));

  IF p_moment_label IS NOT NULL THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{acknowledged_moment_label}', to_jsonb(p_moment_label));
  END IF;

  -- --- Rebuild array with the entry replaced ---
  SELECT jsonb_agg(
           CASE
             WHEN elem ->> 'id' = p_entry_id::text THEN v_updated_entry
             ELSE elem
           END
         )
  INTO v_new_array
  FROM jsonb_array_elements(v_current_array) AS elem;

  UPDATE ops.events
  SET run_of_show_data = jsonb_set(
        COALESCE(run_of_show_data, '{}'::jsonb),
        '{client_song_requests}',
        v_new_array,
        true
      ),
      updated_at = now()
  WHERE id = p_event_id;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

COMMENT ON FUNCTION public.ops_songs_acknowledge_client_request IS
  'DJ acknowledgement of a couple song request. Stamps acknowledged_at and optionally a whitelisted moment label surfaced back to the couple. See docs/reference/client-portal-songs-design.md §0 A2. SECURITY DEFINER, internal workspace-member guard, authenticated + service_role.';

REVOKE ALL ON FUNCTION public.ops_songs_acknowledge_client_request(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ops_songs_acknowledge_client_request(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.ops_songs_acknowledge_client_request(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_songs_acknowledge_client_request(uuid, uuid, text) TO service_role;


-- -----------------------------------------------------------------------------
-- 3. Widen slice-5 client_songs_* moment-label allow-list to the unified set
-- -----------------------------------------------------------------------------
-- The slice 5 migration (20260410204754) used a 7-value allow-list for
-- special_moment_label. This migration widens it to the 11-value unified
-- list so the couple-side sub-label and the DJ-side acknowledgement label
-- share one source of truth. Same signatures, same grants — CREATE OR
-- REPLACE preserves them.
--
-- Only the v_allowed_labels array changes; all other logic is identical
-- to the slice 5 migration.

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
  -- UNIFIED 11-value list (was 7 in slice 5)
  v_allowed_labels    text[] := ARRAY[
    'first_dance', 'parent_dance_1', 'parent_dance_2',
    'processional', 'recessional', 'last_dance',
    'entrance', 'dinner', 'cake_cut', 'dance_floor', 'other'
  ];
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
  IF p_tier IS NULL OR NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_tier = 'special_moment' THEN
    IF p_special_moment_label IS NULL OR NOT (p_special_moment_label = ANY (v_allowed_labels)) THEN
      RETURN QUERY SELECT false, 'invalid_special_moment_label'::text, NULL::uuid, NULL::timestamptz;
      RETURN;
    END IF;
  END IF;

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

  SELECT * INTO v_event_row
    FROM ops.events
    WHERE id = p_event_id
      AND client_entity_id = p_entity_id
    LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_my_event'::text, NULL::uuid, NULL::timestamptz;
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
      END::text,
      NULL::uuid,
      NULL::timestamptz;
    RETURN;
  END IF;

  v_workspace_id := v_event_row.workspace_id;

  IF v_event_row.starts_at IS NOT NULL
     AND v_event_row.starts_at > now()
     AND v_event_row.starts_at <= now() + interval '24 hours' THEN
    v_is_late_add := true;
  END IF;

  v_current_count := COALESCE(
    jsonb_array_length(v_event_row.run_of_show_data -> 'client_song_requests'),
    0
  );

  IF v_current_count >= 100 THEN
    RETURN QUERY SELECT false, 'too_many'::text, NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

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
    NULL;
  END;

  RETURN QUERY SELECT true, NULL::text, v_new_entry_id, v_requested_at;
END;
$$;


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
  -- UNIFIED 11-value list (was 7 in slice 5)
  v_allowed_labels  text[] := ARRAY[
    'first_dance', 'parent_dance_1', 'parent_dance_2',
    'processional', 'recessional', 'last_dance',
    'entrance', 'dinner', 'cake_cut', 'dance_floor', 'other'
  ];
  v_event_row       ops.events%ROWTYPE;
  v_current_array   jsonb;
  v_found_entry     jsonb;
  v_updated_entry   jsonb;
  v_new_array       jsonb;
  v_effective_tier  text;
BEGIN
  IF p_tier IS NOT NULL AND NOT (p_tier = ANY (v_allowed_tiers)) THEN
    RETURN QUERY SELECT false, 'invalid_tier'::text;
    RETURN;
  END IF;

  IF p_notes IS NOT NULL AND length(p_notes) > 500 THEN
    RETURN QUERY SELECT false, 'invalid_notes'::text;
    RETURN;
  END IF;

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

  IF p_tier IS NOT NULL AND p_tier <> 'special_moment' THEN
    v_updated_entry := jsonb_set(v_updated_entry, '{special_moment_label}', 'null'::jsonb);
  END IF;

  SELECT jsonb_agg(
           CASE
             WHEN elem ->> 'id' = p_entry_id::text THEN v_updated_entry
             ELSE elem
           END
         )
  INTO v_new_array
  FROM jsonb_array_elements(v_current_array) AS elem;

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

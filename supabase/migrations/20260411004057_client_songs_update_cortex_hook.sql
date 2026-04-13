-- =============================================================================
-- Phase 0.5b slice 15 / B2 — extend cortex.aion_memory hook to update path
-- =============================================================================
-- Adds the episodic-memory hook to client_songs_update_request so Aion sees
-- tier changes and note edits, not just initial adds. Slice 5 already landed
-- the hook on client_songs_add_request; this completes coverage for the
-- two write paths that mutate couple song state.
--
-- Design doc §0 B2 (schema-corrected) rationale:
--   The original B2 proposal asked for cortex.memory, but that table's
--   embedding column is NOT NULL and requires async embedding generation.
--   We use cortex.aion_memory instead — the episodic text-fact store with
--   built-in dedupe (save_aion_memory bumps confidence + updated_at for
--   identical facts). Same user value: Aion gets visibility into couple
--   song preferences on day one, no embedding work required.
--
-- Delete path deliberately skipped:
--   cortex.aion_memory is an append-only episodic store — there's no
--   delete RPC. Writing a "[REMOVED ...]" fact would pollute memory with
--   negative entries the current Aion consumer doesn't interpret. Phase 3
--   summarization can build a proper consumer that reads the append-only
--   stream and resolves current state. For now, add + update are sufficient
--   coverage — a couple who removes and re-adds still appears as an
--   episodic update.
--
-- Fail-soft pattern (same as slice 5):
--   Cortex write errors must NOT roll back the JSONB update. The hook
--   is wrapped in a nested BEGIN/EXCEPTION block that swallows errors.
--
-- Companion migrations:
--   1. 20260410204754_client_portal_songs_client_rpcs      (slice 5 — add path hook)
--   2. 20260410205821_ops_songs_dj_rpcs                    (slice 6 — promote/ack)
--   3. THIS FILE (20260411004057)                           — update path hook
--
-- Grant discipline:
--   CREATE OR REPLACE preserves the existing grants from slice 5. We
--   re-assert the REVOKE + GRANT block at the bottom for clarity and
--   to catch any accidental drift during future refactors. Regression
--   gate (35 anon-callable SECDEF count) verified post-apply.
--
-- Smoke test (ran live in MCP via BEGIN/ROLLBACK before commit):
--   add → +1 cortex row, fact shape "[must_play] Beyoncé — Crazy In Love (Jordan pick)"
--   update tier+notes → +1 cortex row, "[play_if_possible] Beyoncé — Crazy In Love (actually second tier)"
--   repeat identical update → dedupe (no new row)
--   delete → no cortex side effect
-- =============================================================================

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
SET search_path = 'public', 'ops', 'cortex', 'extensions'
AS $$
DECLARE
  v_allowed_tiers   text[] := ARRAY['must_play', 'play_if_possible', 'do_not_play', 'special_moment'];
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
  v_fact_text       text;
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

  -- B2 cortex hook (slice 15 addition): write a new episodic fact reflecting
  -- the updated state. save_aion_memory dedupes by (workspace, scope, fact),
  -- so repeated updates with the same tier + notes just bump confidence and
  -- updated_at rather than creating duplicate rows.
  -- Fail-soft — cortex errors must NOT roll back the JSONB update.
  BEGIN
    v_fact_text := format(
      '[%s] %s%s%s',
      v_updated_entry ->> 'tier',
      CASE WHEN (v_updated_entry ->> 'artist') <> ''
           THEN (v_updated_entry ->> 'artist') || ' — '
           ELSE '' END,
      v_updated_entry ->> 'title',
      CASE WHEN (v_updated_entry ->> 'notes') <> ''
           THEN ' (' || (v_updated_entry ->> 'notes') || ')'
           ELSE '' END
    );

    PERFORM cortex.save_aion_memory(
      v_event_row.workspace_id,
      'episodic',
      v_fact_text,
      'client_portal_songs'
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

-- CREATE OR REPLACE preserves grants from slice 5. Re-asserting for clarity.
REVOKE ALL ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.client_songs_update_request(uuid, uuid, uuid, text, text, text, text) TO service_role;

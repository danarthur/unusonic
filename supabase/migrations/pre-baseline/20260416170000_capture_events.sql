-- =============================================================================
-- cortex.capture_events — user-initiated voice/text capture on the lobby.
--
-- Phase 1 of the Sales Brief v2 capture primitive. A user taps the lobby
-- capture button, dictates a thought, Aion transcribes (Whisper) and parses
-- (LLM structured output) into a suggested entity + follow-up + note, and
-- only after the user confirms the review card does anything get persisted.
--
-- The row is the audit trail for one confirmed capture. Downstream writes
-- (ghost entity, follow-up queue row, aion_memory note) are orchestrated
-- by the server action and their FKs are linked back here.
--
-- Nothing is persisted for abandoned/cancelled captures. Privacy-friendlier
-- and simpler; abandonment telemetry can be added later if needed.
--
-- See docs/reference/sales-brief-v2-design.md §10.
-- =============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cortex.capture_events (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id               uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id                    uuid        NOT NULL REFERENCES auth.users(id)       ON DELETE CASCADE,

  audio_storage_path         text,
  transcript                 text,
  parsed_entity              jsonb,
  parsed_follow_up           jsonb,
  parsed_note                text,

  status                     text        NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'dismissed', 'failed')),

  resolved_entity_id         uuid        REFERENCES directory.entities(id),
  created_follow_up_queue_id uuid        REFERENCES ops.follow_up_queue(id),

  created_at                 timestamptz NOT NULL DEFAULT now(),
  confirmed_at               timestamptz,
  dismissed_at               timestamptz
);

CREATE INDEX IF NOT EXISTS idx_capture_events_ws_user_created
  ON cortex.capture_events (workspace_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_capture_events_entity
  ON cortex.capture_events (resolved_entity_id)
  WHERE resolved_entity_id IS NOT NULL;

-- ── 2. RLS — SELECT only per cortex write-protection rule ────────────────────

ALTER TABLE cortex.capture_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY capture_events_select ON cortex.capture_events
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON cortex.capture_events TO authenticated;
GRANT ALL    ON cortex.capture_events TO service_role;

-- Writes are via SECURITY DEFINER RPC only. No INSERT/UPDATE/DELETE policies
-- to prevent privilege escalation (see CLAUDE.md cortex rules).


-- ── 3. Write RPC — record a confirmed capture ────────────────────────────────
--
-- Called from the capture server action after it has already:
--   1. Resolved or ghost-created the entity (directory.entities)
--   2. Inserted a follow_up_queue row if the parse produced one
--   3. Uploaded the audio blob to storage
--   4. Attached a memory fact if the parse produced a note
--
-- The RPC atomically persists the capture record and links it to those
-- downstream rows via FK. Workspace ownership is enforced against the caller's
-- session — a caller passing a workspace_id they don't belong to gets NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.write_capture_confirmed(
  p_workspace_id                uuid,
  p_transcript                  text,
  p_parsed_entity               jsonb DEFAULT NULL,
  p_parsed_follow_up            jsonb DEFAULT NULL,
  p_parsed_note                 text  DEFAULT NULL,
  p_resolved_entity_id          uuid  DEFAULT NULL,
  p_created_follow_up_queue_id  uuid  DEFAULT NULL,
  p_audio_storage_path          text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id       uuid;
  v_user_id  uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Workspace membership guard. get_my_workspace_ids() is unavailable inside
  -- SECURITY DEFINER without resetting search_path, so join directly.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO cortex.capture_events (
    workspace_id, user_id, audio_storage_path, transcript,
    parsed_entity, parsed_follow_up, parsed_note,
    resolved_entity_id, created_follow_up_queue_id,
    status, confirmed_at
  ) VALUES (
    p_workspace_id, v_user_id, p_audio_storage_path, p_transcript,
    p_parsed_entity, p_parsed_follow_up, p_parsed_note,
    p_resolved_entity_id, p_created_follow_up_queue_id,
    'confirmed', now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Close the default-PUBLIC-grant hole (see migration 20260410170000).
REVOKE EXECUTE ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text
) TO authenticated;


-- ── 4. Storage bucket for capture audio ──────────────────────────────────────
--
-- Private bucket. Files are stored at `captures/{workspace_id}/{capture_id}.webm`.
-- Only workspace members can read their workspace's captures; writes happen
-- server-side via the service-role client from the capture server action.
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'captures',
  'captures',
  false,
  10 * 1024 * 1024,                                         -- 10 MB cap per clip
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Read policy: members can read files under their own workspace prefix.
-- Path convention: `{workspace_id}/{capture_id}.webm` — first path segment
-- is the workspace UUID, which storage.foldername() parses as an array.
CREATE POLICY captures_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'captures'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_my_workspace_ids())
  );

-- Writes via service_role only (no INSERT/UPDATE policy for authenticated).
-- Service role bypasses RLS, so no grant needed here.

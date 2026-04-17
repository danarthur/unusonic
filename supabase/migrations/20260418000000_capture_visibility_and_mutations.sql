-- =============================================================================
-- Capture surfaces Phase A — visibility column, entity/workspace read indexes,
-- owner-only mutation RPCs (reassign / edit / visibility / dismiss).
--
-- Design: docs/reference/capture-surfaces-design.md §4, §10, §11.
--
-- Privacy model (the single most important schema decision in this migration):
--   - visibility = 'user'      → only the capturing user_id can see/edit
--   - visibility = 'workspace' → any workspace member can see; owner-only edit
--   Default is 'user' for safety. Promotion to 'workspace' is explicit via
--   composer toggle or the entity-timeline row menu.
-- =============================================================================

-- ── 1. visibility column ─────────────────────────────────────────────────────

ALTER TABLE cortex.capture_events
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'user';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capture_events_visibility_check'
      AND conrelid = 'cortex.capture_events'::regclass
  ) THEN
    ALTER TABLE cortex.capture_events
      ADD CONSTRAINT capture_events_visibility_check
      CHECK (visibility IN ('user', 'workspace'));
  END IF;
END
$$;

-- ── 2. Indexes for primary read paths ────────────────────────────────────────

-- Entity detail page: reverse-chron timeline for one entity.
CREATE INDEX IF NOT EXISTS idx_capture_events_resolved_entity_id_confirmed
  ON cortex.capture_events (resolved_entity_id, created_at DESC)
  WHERE status = 'confirmed';

-- Activity feed: workspace-wide reverse-chron stream of confirmed captures.
CREATE INDEX IF NOT EXISTS idx_capture_events_workspace_created_confirmed
  ON cortex.capture_events (workspace_id, created_at DESC)
  WHERE status = 'confirmed';

-- ── 3. Replace RLS SELECT with visibility filter ─────────────────────────────

DROP POLICY IF EXISTS capture_events_select ON cortex.capture_events;

CREATE POLICY capture_events_select ON cortex.capture_events
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND (
      visibility = 'workspace'
      OR (visibility = 'user' AND user_id = auth.uid())
    )
  );

-- ── 4. Extend write_capture_confirmed with p_visibility ──────────────────────
-- Signature change (8 → 9 params) requires DROP first.

DROP FUNCTION IF EXISTS cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text
);

CREATE OR REPLACE FUNCTION cortex.write_capture_confirmed(
  p_workspace_id                uuid,
  p_transcript                  text,
  p_parsed_entity               jsonb DEFAULT NULL,
  p_parsed_follow_up            jsonb DEFAULT NULL,
  p_parsed_note                 text  DEFAULT NULL,
  p_resolved_entity_id          uuid  DEFAULT NULL,
  p_created_follow_up_queue_id  uuid  DEFAULT NULL,
  p_audio_storage_path          text  DEFAULT NULL,
  p_visibility                  text  DEFAULT 'user'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id      uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_visibility NOT IN ('user', 'workspace') THEN
    RETURN NULL;
  END IF;

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
    status, confirmed_at, visibility
  ) VALUES (
    p_workspace_id, v_user_id, p_audio_storage_path, p_transcript,
    p_parsed_entity, p_parsed_follow_up, p_parsed_note,
    p_resolved_entity_id, p_created_follow_up_queue_id,
    'confirmed', now(), p_visibility
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Close default-PUBLIC grant (per memory note: Postgres function grants default
-- to PUBLIC — every SECURITY DEFINER must explicitly revoke from anon).
REVOKE EXECUTE ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text
) TO authenticated;


-- ── 5. Mutation RPCs — reassign / edit / visibility / dismiss ────────────────
--
-- All four follow the same pattern:
--   1. auth.uid() must be non-null
--   2. caller must be a workspace_members row for the capture's workspace
--   3. ONLY THE CAPTURE OWNER may mutate (all four ops are owner-scoped).
--      This is stricter than the RLS SELECT policy — a teammate seeing a
--      workspace-visible capture cannot rewrite or delete it. Captures are
--      the seller's mental notes; mutation rights belong to the author.
-- =============================================================================

-- 5a. Reassign resolved_entity_id (misattribution recovery).
CREATE OR REPLACE FUNCTION cortex.reassign_capture(
  p_capture_id    uuid,
  p_new_entity_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  -- If a new entity is supplied, it must live in the same workspace.
  IF p_new_entity_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_new_entity_id AND owner_workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET resolved_entity_id = p_new_entity_id
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.reassign_capture(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION cortex.reassign_capture(uuid, uuid) TO authenticated;

-- 5b. Update transcript and/or parsed_note.
CREATE OR REPLACE FUNCTION cortex.update_capture_content(
  p_capture_id  uuid,
  p_transcript  text DEFAULT NULL,
  p_parsed_note text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  -- NULL in either param = leave unchanged. Empty string = clear (only makes
  -- sense for parsed_note).
  UPDATE cortex.capture_events
    SET
      transcript  = COALESCE(p_transcript, transcript),
      parsed_note = CASE WHEN p_parsed_note IS NULL THEN parsed_note
                         WHEN p_parsed_note = ''     THEN NULL
                         ELSE p_parsed_note END
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.update_capture_content(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION cortex.update_capture_content(uuid, text, text) TO authenticated;

-- 5c. Toggle visibility (user ↔ workspace).
CREATE OR REPLACE FUNCTION cortex.update_capture_visibility(
  p_capture_id uuid,
  p_visibility text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF p_visibility NOT IN ('user', 'workspace') THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET visibility = p_visibility
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.update_capture_visibility(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION cortex.update_capture_visibility(uuid, text) TO authenticated;

-- 5d. Soft-delete.
CREATE OR REPLACE FUNCTION cortex.dismiss_capture(
  p_capture_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET status = 'dismissed', dismissed_at = now()
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.dismiss_capture(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION cortex.dismiss_capture(uuid) TO authenticated;

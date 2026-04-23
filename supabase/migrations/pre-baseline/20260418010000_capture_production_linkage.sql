-- =============================================================================
-- Capture surfaces — Production linkage (deals + events).
--
-- Users mentally organize notes by production ("Ally & Emily wedding"), not
-- just by contact. When a capture references a production — typically in the
-- transcript ("met about Ally Emily wedding") — we link it to the deal or
-- event so the note surfaces on the production page AND groups under the
-- production on the entity page.
--
-- Mutual exclusion: a capture links to AT MOST ONE production (either a
-- deal during sales, or an event after conversion). Future work may
-- auto-carry the link when a deal converts to an event — out of scope here.
--
-- Design: docs/reference/capture-surfaces-design.md (extension).
-- =============================================================================

-- ── 1. Linked-production columns ─────────────────────────────────────────────

ALTER TABLE cortex.capture_events
  ADD COLUMN IF NOT EXISTS linked_deal_id uuid
    REFERENCES public.deals(id) ON DELETE SET NULL;

ALTER TABLE cortex.capture_events
  ADD COLUMN IF NOT EXISTS linked_event_id uuid
    REFERENCES ops.events(id) ON DELETE SET NULL;

-- At most one production link per capture. A deal link during sales, or an
-- event link after conversion — never both.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'capture_events_single_production_link'
      AND conrelid = 'cortex.capture_events'::regclass
  ) THEN
    ALTER TABLE cortex.capture_events
      ADD CONSTRAINT capture_events_single_production_link
      CHECK (linked_deal_id IS NULL OR linked_event_id IS NULL);
  END IF;
END
$$;

-- ── 2. Indexes for production-scoped reads ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_capture_events_linked_deal_created
  ON cortex.capture_events (linked_deal_id, created_at DESC)
  WHERE linked_deal_id IS NOT NULL AND status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_capture_events_linked_event_created
  ON cortex.capture_events (linked_event_id, created_at DESC)
  WHERE linked_event_id IS NOT NULL AND status = 'confirmed';

-- ── 3. Extend write_capture_confirmed with linked-production params ──────────

DROP FUNCTION IF EXISTS cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text
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
  p_visibility                  text  DEFAULT 'user',
  p_linked_deal_id              uuid  DEFAULT NULL,
  p_linked_event_id             uuid  DEFAULT NULL
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
  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_visibility NOT IN ('user', 'workspace') THEN RETURN NULL; END IF;

  -- Reject ambiguous double-link. The CHECK constraint would also catch this
  -- but fail loudly during INSERT; surface the error earlier as a NULL result.
  IF p_linked_deal_id IS NOT NULL AND p_linked_event_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Linked production must belong to the same workspace.
  IF p_linked_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_linked_deal_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_linked_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ops.events
    WHERE id = p_linked_event_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO cortex.capture_events (
    workspace_id, user_id, audio_storage_path, transcript,
    parsed_entity, parsed_follow_up, parsed_note,
    resolved_entity_id, created_follow_up_queue_id,
    status, confirmed_at, visibility,
    linked_deal_id, linked_event_id
  ) VALUES (
    p_workspace_id, v_user_id, p_audio_storage_path, p_transcript,
    p_parsed_entity, p_parsed_follow_up, p_parsed_note,
    p_resolved_entity_id, p_created_follow_up_queue_id,
    'confirmed', now(), p_visibility,
    p_linked_deal_id, p_linked_event_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid
) TO authenticated;

-- ── 4. Relink production RPC ─────────────────────────────────────────────────
--
-- Lets the capture author change which deal/event a note is linked to — or
-- clear the link entirely. Workspace + ownership semantics match the other
-- mutation RPCs.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.relink_capture_production(
  p_capture_id      uuid,
  p_linked_deal_id  uuid DEFAULT NULL,
  p_linked_event_id uuid DEFAULT NULL
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
  IF p_linked_deal_id IS NOT NULL AND p_linked_event_id IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  SELECT workspace_id, user_id INTO v_workspace, v_owner_user
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  IF p_linked_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_linked_deal_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  IF p_linked_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ops.events
    WHERE id = p_linked_event_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET linked_deal_id  = p_linked_deal_id,
        linked_event_id = p_linked_event_id
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.relink_capture_production(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION cortex.relink_capture_production(uuid, uuid, uuid) TO authenticated;

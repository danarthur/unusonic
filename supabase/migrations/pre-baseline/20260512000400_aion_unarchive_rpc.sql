-- =============================================================================
-- Unarchive RPC — pairs with cortex.archive_aion_session from 20260512000100.
--
-- Cortex is write-protected (SELECT-only RLS, writes via SECURITY DEFINER
-- RPCs), so archive-restore must go through a function. Used by the
-- "Show archived" sidebar view when a user wants to pull a thread back.
--
-- Design: docs/reference/aion-deal-chat-design.md + 2026-04-21 multi-thread
-- design pass (Field Expert §5 "archive is shipped, restore is one click").
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.unarchive_aion_session(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_sessions
     SET archived_at = NULL,
         updated_at  = now()
   WHERE id      = p_session_id
     AND user_id = v_user_id
     AND archived_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found, not owned, or not archived'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION cortex.unarchive_aion_session(uuid) IS
  'Restore a soft-deleted Aion session. Caller must own the session and it must be currently archived. Pair with cortex.archive_aion_session.';

REVOKE ALL ON FUNCTION cortex.unarchive_aion_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.unarchive_aion_session(uuid)
  TO authenticated, service_role;

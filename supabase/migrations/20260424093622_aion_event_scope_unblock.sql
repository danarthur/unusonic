-- Phase 3 Sprint 3 Wk 8 — event-scope unblock.
--
-- Two RPCs currently RAISE on `scope_type = 'event'` with SQLSTATE 0A000:
--   cortex.resume_or_create_aion_session
--   cortex.create_new_aion_session_for_scope
--
-- Per plan §3.6, replace those RAISE branches with real workspace
-- validation against ops.events. Event scope has no state-table dependency
-- (ops.events has workspace_id directly), so we do the check inline rather
-- than adding an ops.event_in_workspace helper.
--
-- Both functions keep their existing SECURITY DEFINER + search_path posture
-- and their signatures. Nothing else in the function body changes.
--
-- Plan landmine: validation requires membership in the event's workspace.
-- Cross-workspace event-id attacks return 42501 (permission denied), matching
-- the deal-scope pattern.

CREATE OR REPLACE FUNCTION cortex.resume_or_create_aion_session(
  p_workspace_id uuid,
  p_scope_type text,
  p_scope_entity_id uuid DEFAULT NULL::uuid,
  p_title text DEFAULT NULL::text
)
  RETURNS TABLE(session_id uuid, is_new boolean)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public', 'ops'
AS $function$
DECLARE
  v_user_id    uuid;
  v_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope sessions must not have a scope_entity_id' USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope sessions require a scope_entity_id', p_scope_type USING ERRCODE = '22023';
  END IF;
  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals WHERE id = p_scope_entity_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    IF NOT EXISTS (
      SELECT 1 FROM ops.events WHERE id = p_scope_entity_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Event not found in workspace' USING ERRCODE = '42501';
    END IF;
  END IF;
  SELECT id INTO v_session_id
    FROM cortex.aion_sessions
   WHERE user_id         = v_user_id
     AND workspace_id    = p_workspace_id
     AND scope_type      = p_scope_type
     AND scope_entity_id IS NOT DISTINCT FROM p_scope_entity_id
     AND archived_at     IS NULL
   ORDER BY last_message_at DESC
   LIMIT 1;
  IF v_session_id IS NOT NULL THEN
    RETURN QUERY SELECT v_session_id, false;
    RETURN;
  END IF;
  INSERT INTO cortex.aion_sessions (workspace_id, user_id, scope_type, scope_entity_id, title)
  VALUES (p_workspace_id, v_user_id, p_scope_type, p_scope_entity_id, p_title)
  RETURNING id INTO v_session_id;
  RETURN QUERY SELECT v_session_id, true;
END;
$function$;

CREATE OR REPLACE FUNCTION cortex.create_new_aion_session_for_scope(
  p_workspace_id uuid,
  p_scope_type text,
  p_scope_entity_id uuid DEFAULT NULL::uuid,
  p_title text DEFAULT NULL::text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public', 'ops'
AS $function$
DECLARE
  v_user_id    uuid;
  v_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope sessions must not have a scope_entity_id' USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope sessions require a scope_entity_id', p_scope_type USING ERRCODE = '22023';
  END IF;
  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals WHERE id = p_scope_entity_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    IF NOT EXISTS (
      SELECT 1 FROM ops.events WHERE id = p_scope_entity_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Event not found in workspace' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO cortex.aion_sessions (workspace_id, user_id, scope_type, scope_entity_id, title)
  VALUES (p_workspace_id, v_user_id, p_scope_type, p_scope_entity_id, p_title)
  RETURNING id INTO v_session_id;
  RETURN v_session_id;
END;
$function$;

-- Grants — match the current posture on both functions (unchanged).
REVOKE EXECUTE ON FUNCTION cortex.resume_or_create_aion_session(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.resume_or_create_aion_session(uuid, text, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION cortex.create_new_aion_session_for_scope(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.create_new_aion_session_for_scope(uuid, text, uuid, text) TO authenticated, service_role;

-- Safety audit — fail the migration if grants ever drift open.
DO $$
DECLARE
  v_public_execute boolean;
  v_anon_execute   boolean;
BEGIN
  FOR v_public_execute IN
    SELECT has_function_privilege('public', p.oid, 'EXECUTE')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'cortex'
       AND p.proname IN ('resume_or_create_aion_session', 'create_new_aion_session_for_scope')
  LOOP
    IF v_public_execute THEN
      RAISE EXCEPTION 'Safety audit: public still holds EXECUTE on a cortex aion-session RPC';
    END IF;
  END LOOP;

  FOR v_anon_execute IN
    SELECT has_function_privilege('anon', p.oid, 'EXECUTE')
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'cortex'
       AND p.proname IN ('resume_or_create_aion_session', 'create_new_aion_session_for_scope')
  LOOP
    IF v_anon_execute THEN
      RAISE EXCEPTION 'Safety audit: anon still holds EXECUTE on a cortex aion-session RPC';
    END IF;
  END LOOP;
END $$;

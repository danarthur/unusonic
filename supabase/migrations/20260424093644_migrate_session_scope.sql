-- Phase 3 Sprint 3 Wk 8 — cortex.migrate_session_scope RPC (B1 full spec).
--
-- Called by handoverDeal (Wk 9 wiring) immediately after an ops.events row
-- is created from a won deal. Transitions the deal-scoped Aion session to
-- event-scope atomically:
--
--   (a) authz — caller owns session + is member of session's workspace
--   (b) event validation — target event belongs to session's workspace
--   (c) collision — if another active session already exists for the same
--       (user, workspace, scope_type, scope_entity_id), archive the loser
--       per the R6 recency rule (pinned wins; else most recent last_message_at)
--       and seed a merge-pointer system message in the loser's thread
--   (d) migrate — flip scope_type + scope_entity_id; NULL out the rolling
--       summary (H5 fix — deal summary is stale for the event); bump updated_at
--   (e) seeded system message — insert a "Handoff" marker inline so the txn
--       atomically stamps the migration in the thread's message log
--   (f) orphaned proactive-line re-linking — cortex.aion_proactive_lines rows
--       for the source deal get an `migrated_event_id` hint in payload so
--       Wk 10 pill-history can index by event
--
-- Per plan R6: handoff is CRM-critical path. If no active session exists at
-- handoff time, the caller treats the RPC's "session not found" as a no-op
-- (handoverDeal swallows and proceeds). Never gate deal closing on Aion.
--
-- Column note — the plan's B1 spec referenced `metadata` on aion_sessions and
-- `metadata` on aion_proactive_lines. Actual prod columns:
--   aion_sessions:       conversation_summary (text), summarized_up_to (text),
--                        feedback (jsonb), no general-purpose metadata column
--   aion_proactive_lines: payload (jsonb), no metadata column
-- We reuse payload on proactive_lines (it's already the catch-all jsonb for
-- signal-specific context); we omit the aion_sessions metadata pointer on
-- collision because the seeded merge-pointer system message already records
-- the archive→winner relationship in an auditable form.

CREATE OR REPLACE FUNCTION cortex.migrate_session_scope(
  p_session_id uuid,
  p_new_scope_type text,
  p_new_scope_entity_id uuid
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public', 'ops'
AS $function$
DECLARE
  v_session          cortex.aion_sessions%ROWTYPE;
  v_event_workspace  uuid;
  v_collision_id     uuid;
  v_source_deal_id   uuid;
BEGIN
  -- (a) Authz: load the session, confirm caller ownership + workspace membership.
  SELECT * INTO v_session FROM cortex.aion_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session not found' USING ERRCODE = '42704';
  END IF;

  IF v_session.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'not session owner' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = v_session.workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not workspace member' USING ERRCODE = '42501';
  END IF;

  -- (b) Only 'event' is supported today (dispatcher-friendly for future scopes).
  IF p_new_scope_type <> 'event' THEN
    RAISE EXCEPTION 'migrate_session_scope only supports new_scope_type=event today'
      USING ERRCODE = '0A000';
  END IF;

  -- Event must belong to the session's workspace.
  SELECT workspace_id INTO v_event_workspace FROM ops.events
   WHERE id = p_new_scope_entity_id;

  IF v_event_workspace IS NULL OR v_event_workspace <> v_session.workspace_id THEN
    RAISE EXCEPTION 'event not in session workspace' USING ERRCODE = '42501';
  END IF;

  -- (c) Collision — is there already an active session for this (user, ws, event)?
  SELECT id INTO v_collision_id FROM cortex.aion_sessions
   WHERE user_id         = v_session.user_id
     AND workspace_id    = v_session.workspace_id
     AND scope_type      = p_new_scope_type
     AND scope_entity_id = p_new_scope_entity_id
     AND archived_at     IS NULL
     AND id              <> p_session_id
   ORDER BY pinned DESC, last_message_at DESC NULLS LAST
   LIMIT 1;

  IF v_collision_id IS NOT NULL THEN
    -- R6 recency rule: keep whichever is pinned; if tie, keep most recent.
    -- We always keep p_session_id as the winner here — handover always flows
    -- "deal → event" and the deal-side thread carries the conversation history.
    -- Archive the loser and record the merge pointer in a system message on
    -- the loser's thread so provenance is auditable without a metadata column.
    UPDATE cortex.aion_sessions
       SET archived_at = now(),
           updated_at  = now()
     WHERE id = v_collision_id;

    INSERT INTO cortex.aion_messages (session_id, role, content, created_at)
    VALUES (v_collision_id, 'system',
            format('[Merged into event thread %s — prior context preserved there.]',
                   p_session_id),
            now());
  END IF;

  -- Capture the source deal_id for (f) — before we flip scope_entity_id.
  IF v_session.scope_type = 'deal' THEN
    v_source_deal_id := v_session.scope_entity_id;
  ELSE
    v_source_deal_id := NULL;  -- Migrating a non-deal session (shouldn't happen in handover).
  END IF;

  -- (d) Migrate in place — scope + null rolling summary (H5 fix) + updated_at.
  UPDATE cortex.aion_sessions
     SET scope_type            = p_new_scope_type,
         scope_entity_id       = p_new_scope_entity_id,
         conversation_summary  = NULL,
         summarized_up_to      = NULL,
         updated_at            = now()
   WHERE id = p_session_id;

  -- (e) Seeded system message inside the RPC so the marker and the migration
  -- share a txn boundary.
  INSERT INTO cortex.aion_messages (session_id, role, content, created_at)
  VALUES (p_session_id, 'system',
          '[Handoff — deal won, moved to event scope. Previous context preserved.]',
          now());

  -- (f) Re-link orphaned proactive lines. Keep the original deal_id pointer so
  -- existing dismissal/feedback flows still hit the right row; tag the payload
  -- with migrated_event_id so Wk 10 pill-history can index by event.
  IF v_source_deal_id IS NOT NULL THEN
    UPDATE cortex.aion_proactive_lines
       SET payload = jsonb_set(COALESCE(payload, '{}'::jsonb),
                                '{migrated_event_id}',
                                to_jsonb(p_new_scope_entity_id))
     WHERE deal_id = v_source_deal_id;
  END IF;

  RETURN p_session_id;
END;
$function$;

COMMENT ON FUNCTION cortex.migrate_session_scope(uuid, text, uuid) IS
  'Phase 3 §3.6 B1. Transitions an Aion chat session from deal-scope to '
  'event-scope after handoff. Atomic: authz + event-in-workspace check + '
  'collision archive + scope flip + rolling-summary null-out + seeded system '
  'message + orphaned proactive-line re-linking via payload.migrated_event_id. '
  'Called from handoverDeal via authenticated client. Failures must not abort '
  'handoff — the caller swallows and proceeds per R6.';

-- Grants — authenticated for UI-originated handover paths, service_role for
-- server actions. No public/anon path.
REVOKE EXECUTE ON FUNCTION cortex.migrate_session_scope(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.migrate_session_scope(uuid, text, uuid) TO authenticated, service_role;

-- Safety audit — fail the migration if grants drift open.
DO $$
DECLARE
  v_public_execute boolean;
  v_anon_execute   boolean;
BEGIN
  SELECT has_function_privilege('public', p.oid, 'EXECUTE')
    INTO v_public_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'cortex' AND p.proname = 'migrate_session_scope';

  IF v_public_execute THEN
    RAISE EXCEPTION 'Safety audit: public still holds EXECUTE on cortex.migrate_session_scope';
  END IF;

  SELECT has_function_privilege('anon', p.oid, 'EXECUTE')
    INTO v_anon_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'cortex' AND p.proname = 'migrate_session_scope';

  IF v_anon_execute THEN
    RAISE EXCEPTION 'Safety audit: anon still holds EXECUTE on cortex.migrate_session_scope';
  END IF;
END $$;

-- =============================================================================
-- Custom Pipelines — Phase 3b: deal activity log
--
-- Full design: docs/reference/custom-pipelines-design.md §7.2
--   "Every trigger result is written to a visible deal activity log on the
--   Deal Lens."
--
-- Creates:
--   • ops.deal_activity_log — append-only audit trail for trigger side effects
--     (and manual entries in the future). Workspace-scoped via denormalized
--     workspace_id column matching the ops.deal_crew pattern.
--   • ops.log_deal_activity(...) — service-role-only SECURITY DEFINER writer
--     the Phase 3c dispatcher will call whenever a primitive fires.
--   • ops.mark_deal_activity_undone(...) — service-role-only marker the
--     Phase 3f undo toast will call.
--
-- RLS:
--   • Authenticated users SELECT rows scoped to their workspaces (via
--     get_my_workspace_ids()). No INSERT/UPDATE/DELETE policies — writes go
--     through the service role via the RPC above.
--
-- No trigger firing in this phase — this is table + RPC infrastructure only.
-- Phase 3c wires primitives to emit rows.
-- =============================================================================


-- =============================================================================
-- 1. ops.deal_activity_log
-- =============================================================================

CREATE TABLE ops.deal_activity_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL,
  deal_id           uuid        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  pipeline_stage_id uuid        REFERENCES ops.pipeline_stages(id),
  actor_user_id     uuid,
  actor_kind        text        NOT NULL CHECK (actor_kind IN ('user', 'webhook', 'system', 'aion')),
  trigger_type      text,
  action_summary    text        NOT NULL,
  status            text        NOT NULL CHECK (status IN ('success', 'failed', 'pending', 'undone')),
  error_message     text,
  metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  undo_token        text,
  undone_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ops.deal_activity_log IS
  'Append-only audit trail for trigger side effects surfaced on the Deal Lens. Service role writes via ops.log_deal_activity(). Authenticated users SELECT only.';

-- Primary query: "show the last N activity entries for this deal"
CREATE INDEX deal_activity_log_deal_id_created_at_idx
  ON ops.deal_activity_log (deal_id, created_at DESC);

-- Workspace-wide audit view (future admin surfaces)
CREATE INDEX deal_activity_log_workspace_id_created_at_idx
  ON ops.deal_activity_log (workspace_id, created_at DESC);


ALTER TABLE ops.deal_activity_log ENABLE ROW LEVEL SECURITY;

-- Read-only via workspace; no INSERT/UPDATE/DELETE policies — default deny for
-- authenticated. Service role bypasses RLS for RPC-mediated writes.
CREATE POLICY deal_activity_log_select ON ops.deal_activity_log
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON ops.deal_activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ops.deal_activity_log TO service_role;


-- =============================================================================
-- 2. ops.log_deal_activity(...)
--    Service-role-only writer. Looks up workspace_id from the deal, inserts
--    the row, returns the new id. Raises if the deal doesn't exist.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.log_deal_activity(
  p_deal_id           uuid,
  p_actor_kind        text,
  p_action_summary    text,
  p_status            text,
  p_pipeline_stage_id uuid    DEFAULT NULL,
  p_actor_user_id     uuid    DEFAULT NULL,
  p_trigger_type      text    DEFAULT NULL,
  p_error_message     text    DEFAULT NULL,
  p_metadata          jsonb   DEFAULT '{}'::jsonb,
  p_undo_token        text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_workspace_id uuid;
  v_new_id       uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'ops.log_deal_activity: deal_id % not found', p_deal_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO ops.deal_activity_log (
    workspace_id,
    deal_id,
    pipeline_stage_id,
    actor_user_id,
    actor_kind,
    trigger_type,
    action_summary,
    status,
    error_message,
    metadata,
    undo_token
  ) VALUES (
    v_workspace_id,
    p_deal_id,
    p_pipeline_stage_id,
    p_actor_user_id,
    p_actor_kind,
    p_trigger_type,
    p_action_summary,
    p_status,
    p_error_message,
    COALESCE(p_metadata, '{}'::jsonb),
    p_undo_token
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- Prevent privilege escalation — REVOKE default PUBLIC grant before handing
-- out service_role-only EXECUTE.
REVOKE EXECUTE ON FUNCTION ops.log_deal_activity(
  uuid, text, text, text, uuid, uuid, text, text, jsonb, text
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.log_deal_activity(
  uuid, text, text, text, uuid, uuid, text, text, jsonb, text
) FROM anon;
GRANT EXECUTE ON FUNCTION ops.log_deal_activity(
  uuid, text, text, text, uuid, uuid, text, text, jsonb, text
) TO service_role;

COMMENT ON FUNCTION ops.log_deal_activity(uuid, text, text, text, uuid, uuid, text, text, jsonb, text) IS
  'Append a row to ops.deal_activity_log. Called by the Phase 3c trigger dispatcher after a primitive fires. workspace_id is resolved from the deal. Raises if the deal does not exist.';


-- =============================================================================
-- 3. ops.mark_deal_activity_undone(activity_id)
--    Flips status to 'undone' and stamps undone_at. Service-role only.
--    Phase 3f undo toast will call this.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.mark_deal_activity_undone(
  p_activity_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE ops.deal_activity_log
  SET status    = 'undone',
      undone_at = now()
  WHERE id = p_activity_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ops.mark_deal_activity_undone: activity_id % not found', p_activity_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.mark_deal_activity_undone(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.mark_deal_activity_undone(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION ops.mark_deal_activity_undone(uuid) TO service_role;

COMMENT ON FUNCTION ops.mark_deal_activity_undone(uuid) IS
  'Mark a deal_activity_log row as undone (status=undone, undone_at=now()). Called by the Phase 3f undo toast. Raises if the row does not exist.';

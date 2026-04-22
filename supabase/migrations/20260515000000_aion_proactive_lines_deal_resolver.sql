-- =============================================================================
-- Deal-scoped resolver for proactive lines — Phase 2 Sprint 2 / Week 5.
--
-- The existing cortex.resolve_aion_proactive_lines_by_artifact(ws, kind, id)
-- RPC handles the two proposal-anchored signals:
--   - money_event (deposit_overdue) → resolved when payment arrives
--   - proposal_engagement            → resolved when client replies on thread
-- Both have artifact_ref.kind='proposal' and we already know the proposal id.
--
-- dead_silence lines carry artifact_ref.kind='deal' and need a different
-- resolution trigger: any new message on the deal's thread (in or out)
-- means silence has been broken. This RPC lets the Postmark inbound receiver
-- and the outbound-send helper zero out those lines without guessing the
-- specific proposal id (there may not be one).
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.resolve_aion_proactive_lines_by_deal(
  p_workspace_id uuid,
  p_deal_id      uuid,
  p_signal_type  text DEFAULT NULL  -- NULL = resolve any signal type for the deal
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE cortex.aion_proactive_lines
     SET resolved_at = now()
   WHERE workspace_id = p_workspace_id
     AND deal_id      = p_deal_id
     AND dismissed_at IS NULL
     AND resolved_at IS NULL
     AND (p_signal_type IS NULL OR signal_type = p_signal_type);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION cortex.resolve_aion_proactive_lines_by_deal(uuid, uuid, text) IS
  'Service-role resolver for deal-anchored signals (primarily dead_silence). Called by inbound/outbound message hooks when silence is broken.';

REVOKE ALL ON FUNCTION cortex.resolve_aion_proactive_lines_by_deal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cortex.resolve_aion_proactive_lines_by_deal(uuid, uuid, text)
  TO service_role;

-- =============================================================================
-- Custom Pipelines — Phase 3d: webhook metadata stamp + advance helper
--
-- Full design: docs/reference/custom-pipelines-design.md §9.10 (Webhooks).
--
-- Two pieces:
--   1. public.record_deal_transition() — extended to read two session vars
--      (custom_pipelines.webhook_source + custom_pipelines.webhook_event_id)
--      set via SET LOCAL by the webhook wrapper RPC. When present, the
--      inserted deal_transitions row carries metadata.source='webhook',
--      metadata.webhook_origin=<stripe|docuseal>, metadata.webhook_event_id,
--      and actor_kind='webhook'. Phase 3f's confirmation/undo UI uses these
--      flags to bypass the modal + undo toast (the webhook IS the
--      confirmation — user isn't present).
--
--   2. ops.advance_deal_stage_from_webhook — SECURITY DEFINER helper that
--      atomically SET LOCALs the webhook session vars, runs the pre-check
--      guard (don't regress deals already past the target), and issues the
--      UPDATE that fires record_deal_transition with the webhook metadata
--      merged in. The Supabase JS client can't do multi-statement
--      transactions directly, so this wrapper is the clean path.
--
--      Returns true iff the deal advanced (false when the guard rejected).
--      Throws if the deal doesn't exist. Caller handles both cases.
-- =============================================================================


-- =============================================================================
-- 1. Extend record_deal_transition() to merge webhook session vars
--
--    current_setting(name, missing_ok=true) returns '' when the var isn't set,
--    so an empty string means "no webhook context in this transaction".
--
--    When the vars ARE set, the function:
--      - Overrides actor_kind to 'webhook' (the CHECK constraint on
--        deal_transitions.actor_kind allows 'user'|'webhook'|'system'|'aion').
--      - Merges {source:'webhook', webhook_origin:<stripe|docuseal>,
--        webhook_event_id:<id>} into the default {phase:3} metadata.
--
--    Phase 3a-3c logic (no auto-stamp of triggers_dispatched_at) is preserved.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_deal_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_actor_user       uuid;
  v_actor_kind       text;
  v_webhook_source   text;
  v_webhook_event_id text;
  v_metadata         jsonb;
BEGIN
  -- auth.uid() returns NULL for service-role / webhook / cron writes
  BEGIN
    v_actor_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_user := NULL;
  END;

  -- Phase 3d: look for webhook context set via SET LOCAL by the webhook
  -- advance wrapper. current_setting(..., true) returns '' when the var is
  -- unset — treat empty and NULL identically.
  BEGIN
    v_webhook_source := current_setting('custom_pipelines.webhook_source', true);
  EXCEPTION WHEN OTHERS THEN
    v_webhook_source := NULL;
  END;
  BEGIN
    v_webhook_event_id := current_setting('custom_pipelines.webhook_event_id', true);
  EXCEPTION WHEN OTHERS THEN
    v_webhook_event_id := NULL;
  END;
  IF v_webhook_source = '' THEN v_webhook_source := NULL; END IF;
  IF v_webhook_event_id = '' THEN v_webhook_event_id := NULL; END IF;

  -- actor_kind: webhook > user > system
  v_actor_kind := CASE
    WHEN v_webhook_source IS NOT NULL THEN 'webhook'
    WHEN v_actor_user IS NOT NULL     THEN 'user'
    ELSE                                   'system'
  END;

  -- Build metadata
  v_metadata := jsonb_build_object('phase', 3);
  IF v_webhook_source IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object(
      'source', 'webhook',
      'webhook_origin', v_webhook_source
    );
  END IF;
  IF v_webhook_event_id IS NOT NULL THEN
    v_metadata := v_metadata || jsonb_build_object(
      'webhook_event_id', v_webhook_event_id
    );
  END IF;

  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id,
      v_actor_user, v_actor_kind,
      v_metadata
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, OLD.stage_id, NEW.stage_id,
      v_actor_user, v_actor_kind,
      v_metadata
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.record_deal_transition() IS
  'Phase 3d: records each deal stage change into ops.deal_transitions. Reads custom_pipelines.webhook_source + custom_pipelines.webhook_event_id session vars (set via SET LOCAL by ops.advance_deal_stage_from_webhook) and merges them into the inserted row''s metadata, also flipping actor_kind to ''webhook''. Phase 3f uses those flags to bypass confirm modal + undo toast.';


-- =============================================================================
-- 2. ops.advance_deal_stage_from_webhook
--
--    Service-role only. Called from the Stripe + DocuSeal webhook handlers.
--    Does the SET LOCAL + guarded UPDATE atomically so record_deal_transition
--    picks up the session vars and stamps the metadata.
--
--    Returns true if the deal advanced, false if the guard rejected (deal
--    already past the target stage — re-runs of the same webhook event are
--    no-ops, not errors).
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.advance_deal_stage_from_webhook(
  p_deal_id             uuid,
  p_new_stage_id        uuid,
  p_new_status_slug     text,
  p_webhook_source      text,
  p_webhook_event_id    text,
  p_only_if_status_in   text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_workspace_id   uuid;
  v_current_status text;
  v_updated        int;
BEGIN
  -- Lookup + guard
  SELECT workspace_id, status INTO v_workspace_id, v_current_status
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage_from_webhook: deal not found: %', p_deal_id;
  END IF;

  -- Guard: only advance if the deal is still in one of the caller's
  -- allowed pre-states. A NULL / empty array means "no guard — always advance".
  IF p_only_if_status_in IS NOT NULL
     AND array_length(p_only_if_status_in, 1) IS NOT NULL
     AND v_current_status IS NOT NULL
     AND NOT (v_current_status = ANY (p_only_if_status_in)) THEN
    RETURN false;
  END IF;

  -- Stamp session vars so record_deal_transition() picks them up.
  -- SET LOCAL scopes to the current transaction — every RPC call from the
  -- Supabase JS client runs in its own transaction, so this is safe.
  PERFORM set_config('custom_pipelines.webhook_source', p_webhook_source, true);
  PERFORM set_config('custom_pipelines.webhook_event_id', p_webhook_event_id, true);

  UPDATE public.deals
  SET stage_id   = p_new_stage_id,
      status     = p_new_status_slug,
      updated_at = now()
  WHERE id = p_deal_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[]) TO service_role;

COMMENT ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[]) IS
  'Phase 3d: webhook-initiated stage advance. SET LOCALs the custom_pipelines.webhook_* session vars then UPDATEs public.deals.stage_id + status. The record_deal_transition trigger picks up the session vars and stamps the inserted deal_transitions row with metadata.source=''webhook'', metadata.webhook_origin=<stripe|docuseal>, metadata.webhook_event_id, and actor_kind=''webhook''. Guarded by p_only_if_status_in — returns false instead of regressing deals already past the target stage. Service-role only.';

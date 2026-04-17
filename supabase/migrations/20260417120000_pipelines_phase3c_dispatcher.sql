-- =============================================================================
-- Custom Pipelines — Phase 3c: asynchronous trigger dispatcher
--
-- Full design: docs/reference/custom-pipelines-design.md §7 (Triggers),
-- especially §7.1 (firing mechanism) and §7.5 (dedup).
--
-- Three pieces:
--   1. Flip the Phase 2a `record_deal_transition` trigger so new transitions
--      land with triggers_dispatched_at = NULL, so the cron dispatcher can
--      claim them. Historical rows (Phase 1 backfill + everything already
--      stamped pre-3c) stay stamped and are naturally skipped.
--
--   2. ops.claim_pending_transitions(p_batch_size) — SECURITY DEFINER RPC the
--      /api/cron/dispatch-triggers route calls each minute. Uses FOR UPDATE
--      SKIP LOCKED to prevent two cron invocations from racing, joins the
--      target stage to return its triggers JSONB inline, and filters to
--      workspaces with feature_flags['pipelines.triggers_enabled'] = true.
--      Also computes dedup_skip inline (§7.5: 5-second bounce window).
--
--   3. ops.mark_transition_dispatched / ops.mark_transition_failed —
--      small stamp helpers the TS dispatcher calls after processing each
--      claimed row. Design doc §10 invariant: trigger failure must never
--      block stage change. We consume the row even on failure (setting
--      triggers_failed_at instead of triggers_dispatched_at), so a
--      permanently-broken primitive doesn't wedge the queue.
--
-- RPC security: all three SECURITY DEFINER, EXECUTE revoked from PUBLIC/anon,
-- granted only to service_role (the dispatcher runs via the system client).
-- =============================================================================


-- =============================================================================
-- 1. Flip record_deal_transition(): stop auto-stamping triggers_dispatched_at
--
--    Phase 2a set triggers_dispatched_at = now() on every INSERT so the
--    dispatcher (this phase) would skip pre-Phase-3 rows. Now that the
--    dispatcher is live, new rows must land with triggers_dispatched_at = NULL
--    so the claim query picks them up.
--
--    Historical rows already stamped stay stamped — the claim query's
--    WHERE triggers_dispatched_at IS NULL filter handles that.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_deal_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_actor_user uuid;
  v_actor_kind text;
BEGIN
  -- auth.uid() returns NULL for service-role / webhook / cron writes
  BEGIN
    v_actor_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_user := NULL;
  END;
  v_actor_kind := CASE WHEN v_actor_user IS NULL THEN 'system' ELSE 'user' END;

  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id,
      v_actor_user, v_actor_kind,
      jsonb_build_object('phase', 3)
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
      jsonb_build_object('phase', 3)
    );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.record_deal_transition() IS
  'Phase 3c: records each deal stage change into ops.deal_transitions. Leaves triggers_dispatched_at NULL so the /api/cron/dispatch-triggers route (via ops.claim_pending_transitions) can claim and process primitives. Trigger failure never blocks the stage change because primitive execution happens asynchronously in a separate cron process — this trigger only inserts the queue row in the same transaction as the stage change.';


-- =============================================================================
-- 2. ops.claim_pending_transitions(p_batch_size)
--
--    Claims unprocessed transitions for workspaces that have enabled the
--    pipelines.triggers_enabled feature flag. Joins the target stage so the
--    dispatcher knows the configured triggers inline (saves a round trip).
--
--    Dedup (§7.5): dedup_skip = true when another transition for the same
--    deal landed in the same to_stage within the previous 5 seconds. The
--    TS dispatcher consumes the row (stamps dispatched) without running
--    primitives + writes a 'pending' activity log entry for visibility.
--
--    FOR UPDATE SKIP LOCKED prevents two concurrent claim calls from
--    returning the same row. The row lock is released at this RPC's
--    transaction commit — it is NOT held across the dispatcher's primitive
--    loop. The structural backstop against double-processing is the
--    mark_transition_* helpers' WHERE triggers_dispatched_at IS NULL AND
--    triggers_failed_at IS NULL guard, which raises if the row was already
--    stamped by an earlier tick.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.claim_pending_transitions(
  p_batch_size integer DEFAULT 50
)
RETURNS TABLE (
  transition_id    uuid,
  workspace_id     uuid,
  deal_id          uuid,
  pipeline_id      uuid,
  from_stage_id    uuid,
  to_stage_id      uuid,
  actor_user_id    uuid,
  actor_kind       text,
  entered_at       timestamptz,
  stage_triggers   jsonb,
  stage_slug       text,
  stage_kind       text,
  dedup_skip       boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, ops
AS $$
  WITH claimed AS (
    SELECT t.id
    FROM ops.deal_transitions t
    JOIN public.workspaces w ON w.id = t.workspace_id
    WHERE t.triggers_dispatched_at IS NULL
      AND t.triggers_failed_at IS NULL
      AND (w.feature_flags ->> 'pipelines.triggers_enabled')::boolean IS TRUE
    ORDER BY t.entered_at ASC
    LIMIT GREATEST(p_batch_size, 1)
    FOR UPDATE OF t SKIP LOCKED
  )
  SELECT
    t.id                AS transition_id,
    t.workspace_id,
    t.deal_id,
    t.pipeline_id,
    t.from_stage_id,
    t.to_stage_id,
    t.actor_user_id,
    t.actor_kind,
    t.entered_at,
    s.triggers          AS stage_triggers,
    s.slug              AS stage_slug,
    s.kind              AS stage_kind,
    EXISTS (
      SELECT 1
      FROM ops.deal_transitions prior
      WHERE prior.deal_id     = t.deal_id
        AND prior.to_stage_id = t.to_stage_id
        AND prior.id         <> t.id
        AND prior.entered_at <  t.entered_at
        AND prior.entered_at >= t.entered_at - interval '5 seconds'
    )                   AS dedup_skip
  FROM claimed c
  JOIN ops.deal_transitions t ON t.id = c.id
  JOIN ops.pipeline_stages  s ON s.id = t.to_stage_id
  ORDER BY t.entered_at ASC;
$$;

REVOKE EXECUTE ON FUNCTION ops.claim_pending_transitions(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.claim_pending_transitions(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.claim_pending_transitions(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.claim_pending_transitions(integer) TO service_role;

COMMENT ON FUNCTION ops.claim_pending_transitions(integer) IS
  'Phase 3c: claim pending deal_transitions rows for the trigger dispatcher. FOR UPDATE SKIP LOCKED prevents concurrent cron ticks from double-processing. Filters to workspaces with feature_flags[pipelines.triggers_enabled]=true. Returns each row with its target stage''s triggers JSONB inline + a dedup_skip flag (§7.5: 5s bounce window). Service-role only.';


-- =============================================================================
-- 3. ops.mark_transition_dispatched(p_transition_id)
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.mark_transition_dispatched(
  p_transition_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE ops.deal_transitions
  SET triggers_dispatched_at = now()
  WHERE id = p_transition_id
    AND triggers_dispatched_at IS NULL
    AND triggers_failed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ops.mark_transition_dispatched: transition_id % not found or already processed', p_transition_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.mark_transition_dispatched(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.mark_transition_dispatched(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.mark_transition_dispatched(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.mark_transition_dispatched(uuid) TO service_role;

COMMENT ON FUNCTION ops.mark_transition_dispatched(uuid) IS
  'Phase 3c: stamp a deal_transitions row as dispatched. Called by the TS dispatcher after a primitive runs (or immediately for no-trigger/dedup-skip rows). Service-role only.';


-- =============================================================================
-- 4. ops.mark_transition_failed(p_transition_id, p_error)
--
--    Design doc §10 invariant: trigger failure never blocks the stage change.
--    The stage change has already committed; this helper just records the
--    dispatch failure and consumes the row so the dispatcher doesn't spin
--    on it forever.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.mark_transition_failed(
  p_transition_id uuid,
  p_error         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_rows integer;
BEGIN
  UPDATE ops.deal_transitions
  SET triggers_failed_at = now(),
      triggers_error     = p_error
  WHERE id = p_transition_id
    AND triggers_dispatched_at IS NULL
    AND triggers_failed_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    RAISE EXCEPTION 'ops.mark_transition_failed: transition_id % not found or already processed', p_transition_id
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.mark_transition_failed(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.mark_transition_failed(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.mark_transition_failed(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.mark_transition_failed(uuid, text) TO service_role;

COMMENT ON FUNCTION ops.mark_transition_failed(uuid, text) IS
  'Phase 3c: stamp a deal_transitions row as failed. Called by the TS dispatcher when an unrecoverable error prevents primitive processing (e.g. log-RPC failure). Consumes the row so the dispatcher doesn''t spin on it. Design doc §10: trigger failure never blocks the stage change. Service-role only.';

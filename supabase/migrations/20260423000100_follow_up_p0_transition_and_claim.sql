-- =============================================================================
-- Follow-Up Engine P0 — record_deal_transition + claim_pending_transitions
--
-- Two function replacements:
--
--   1. `record_deal_transition()` now also:
--      • snapshots the target stage's `triggers` JSONB into the new
--        transition row's `triggers_snapshot` column, so dispatcher runs see
--        the config that existed when the stage change happened (not live
--        edits made after).
--      • stamps `superseded_at = now()` on any pending follow-up rows for
--        this deal that originated in a stage OTHER than the new target
--        stage — prevents a deal that advanced from Inquiry → Proposal from
--        accumulating a stale Inquiry nudge still ticking toward escalation.
--
--   2. `ops.claim_pending_transitions()` now returns
--      `COALESCE(t.triggers_snapshot, s.triggers) AS stage_triggers` so
--      snapshot wins over live config when present. Historical rows (pre-
--      this migration, NULL snapshot) fall back to live triggers.
--
-- Idempotent. Re-runnable — CREATE OR REPLACE on both functions.
-- =============================================================================


-- =============================================================================
-- 1. record_deal_transition() — snapshot triggers + supersede stale pending
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
  v_triggers         jsonb;
  v_new_transition_id uuid;
BEGIN
  -- auth.uid() returns NULL for service-role / webhook / cron writes
  BEGIN
    v_actor_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_user := NULL;
  END;
  v_actor_kind := CASE WHEN v_actor_user IS NULL THEN 'system' ELSE 'user' END;

  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    SELECT s.triggers INTO v_triggers
      FROM ops.pipeline_stages s
     WHERE s.id = NEW.stage_id;

    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata, triggers_snapshot
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id,
      v_actor_user, v_actor_kind,
      jsonb_build_object('phase', 3), v_triggers
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
    SELECT s.triggers INTO v_triggers
      FROM ops.pipeline_stages s
     WHERE s.id = NEW.stage_id;

    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata, triggers_snapshot
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, OLD.stage_id, NEW.stage_id,
      v_actor_user, v_actor_kind,
      jsonb_build_object('phase', 3), v_triggers
    )
    RETURNING id INTO v_new_transition_id;

    -- Stamp stale pending follow-ups for this deal as superseded.
    -- "Stale" = originating_stage_id is non-null and not the new target stage.
    -- This prevents Inquiry-stage nudges from escalating on a deal that has
    -- since moved to Proposal. The current-stage pending rows (if any) keep
    -- escalating until dismissed or the deal advances again.
    UPDATE ops.follow_up_queue q
       SET superseded_at = now()
     WHERE q.deal_id = NEW.id
       AND q.status = 'pending'
       AND q.superseded_at IS NULL
       AND q.originating_stage_id IS NOT NULL
       AND q.originating_stage_id <> NEW.stage_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.record_deal_transition() IS
  'Records each deal stage change into ops.deal_transitions with a snapshot of the target stage triggers (P0 follow-up engine). Also stamps superseded_at on pending follow-up rows from prior stages to prevent stale-stage escalation. Trigger failure never blocks the stage change: primitive execution is async (cron-driven), and the supersession UPDATE is logically safe to retry.';


-- =============================================================================
-- 2. claim_pending_transitions — prefer snapshot over live
--
-- Return type expanded with `stage_tags` so the dispatcher can gate
-- tag-dependent primitives without a round-trip. Since PostgreSQL rejects
-- CREATE OR REPLACE when the return type changes, drop first.
-- =============================================================================

DROP FUNCTION IF EXISTS ops.claim_pending_transitions(integer);

CREATE FUNCTION ops.claim_pending_transitions(
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
  stage_tags       text[],
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
    t.id                                        AS transition_id,
    t.workspace_id,
    t.deal_id,
    t.pipeline_id,
    t.from_stage_id,
    t.to_stage_id,
    t.actor_user_id,
    t.actor_kind,
    t.entered_at,
    -- Prefer the snapshot captured at transition time; fall back to the live
    -- stage config only when snapshot is NULL (historical rows pre-P0).
    COALESCE(t.triggers_snapshot, s.triggers)   AS stage_triggers,
    s.slug                                      AS stage_slug,
    s.kind                                      AS stage_kind,
    s.tags                                      AS stage_tags,
    EXISTS (
      SELECT 1
      FROM ops.deal_transitions prior
      WHERE prior.deal_id     = t.deal_id
        AND prior.to_stage_id = t.to_stage_id
        AND prior.id         <> t.id
        AND prior.entered_at <  t.entered_at
        AND prior.entered_at >= t.entered_at - interval '5 seconds'
    )                                           AS dedup_skip
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
  'P0 update: returns COALESCE(t.triggers_snapshot, s.triggers) so snapshot wins when present, live stage config is the fallback. Also exposes stage_tags so primitives can gate on semantic identifiers (proposal_sent, awaiting_signature) rather than slug/label. Otherwise unchanged from Phase 3c.';


-- =============================================================================
-- 3. Dispatcher idempotency helper — record activity log entries keyed by
--    transition_id so a re-run can see what was already emitted.
--    (Reserved for the enroll_in_follow_up primitive; no schema change,
--    adds a helper RPC so the primitive can consult the log.)
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.has_primitive_fired(
  p_transition_id uuid,
  p_primitive     text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ops.deal_activity_log l
    WHERE l.trigger_type = p_primitive
      AND l.status = 'success'
      AND (l.metadata ->> 'transition_id')::uuid = p_transition_id
  );
$$;

REVOKE EXECUTE ON FUNCTION ops.has_primitive_fired(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.has_primitive_fired(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.has_primitive_fired(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.has_primitive_fired(uuid, text) TO service_role;

COMMENT ON FUNCTION ops.has_primitive_fired(uuid, text) IS
  'Second-line idempotency check for primitives. Returns true if ops.deal_activity_log already has a success row for (transition_id, trigger_type). Used when a primitive cannot rely on its own target-artifact existence check (e.g. enroll_in_follow_up when the dedup index has NULL transition_id for pre-P0 rows). Service-role only.';

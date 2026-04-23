-- ============================================================================
-- Phase 3.4 — Aion refusal log
-- ============================================================================
--
-- Every time Aion can't answer because the metric isn't in the registry, we
-- record the question so we know what to expand. Refusal rate > 10% over
-- 30 days is the alert threshold defined in the reports & analytics design.
--
-- Auth contract:
--   - authenticated callers can read their own workspace's log via RLS.
--   - writes go through `cortex.record_refusal` (SECURITY DEFINER) only.
--   - aggregator `ops.metric_aion_refusal_rate` reads both the log and the
--     user-role message counts from cortex.aion_messages for the denominator.
--
-- See: docs/reference/pages/reports-and-analytics-design.md §2.4, §3
--      docs/reference/pages/reports-and-analytics-implementation-plan.md §3.4
-- ============================================================================


-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cortex.aion_refusal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question text NOT NULL,
  reason text NOT NULL,
  attempted_metric_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aion_refusal_log_workspace_created
  ON cortex.aion_refusal_log (workspace_id, created_at DESC);

COMMENT ON TABLE cortex.aion_refusal_log IS
  'Log of Aion refusals (out-of-registry questions). Writes via cortex.record_refusal RPC only. Reads: workspace members via RLS.';
COMMENT ON COLUMN cortex.aion_refusal_log.reason IS
  'Common values: metric_not_in_registry, insufficient_capability, ambiguous_arg, other.';


-- ── RLS: workspace members can read; no direct INSERT/UPDATE/DELETE policy ──
ALTER TABLE cortex.aion_refusal_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY refusal_log_read ON cortex.aion_refusal_log
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
  );

-- No INSERT/UPDATE/DELETE policies — follows cortex convention, mutations only
-- through SECURITY DEFINER RPCs. record_refusal is the sole writer.


-- ── RPC: cortex.record_refusal ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cortex.record_refusal(
  p_workspace_id uuid,
  p_user_id uuid,
  p_question text,
  p_reason text,
  p_attempted_metric_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Authenticated callers must be members of the workspace. service_role
  -- (auth.uid() IS NULL) passes through so the chat route can log even when
  -- an intermediate Aion action executed without user impersonation.
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;

  IF p_question IS NULL OR length(btrim(p_question)) = 0 THEN
    RAISE EXCEPTION 'question must be non-empty' USING ERRCODE = '22023';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'reason must be non-empty' USING ERRCODE = '22023';
  END IF;

  INSERT INTO cortex.aion_refusal_log
    (workspace_id, user_id, question, reason, attempted_metric_id)
  VALUES
    (p_workspace_id, p_user_id, p_question, p_reason, p_attempted_metric_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.record_refusal(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.record_refusal(uuid, uuid, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.record_refusal IS
  'Append a refusal event to cortex.aion_refusal_log. Workspace-membership enforced; service_role bypasses. SECURITY DEFINER — sole writer.';


-- ── RPC: ops.metric_aion_refusal_rate ───────────────────────────────────────
-- Scalar metric. Returns refusal rate as a fraction (0..1) over the period so
-- the registry's unit='percent' formatter renders it as e.g. 12.4%.
--
-- Numerator: rows in cortex.aion_refusal_log for this workspace, created in
--   the last p_days.
-- Denominator: count of user-role messages in cortex.aion_messages across
--   this workspace's aion_sessions in the same window. User messages are a
--   reasonable proxy for "Aion turns" (each user message yields one turn).
--
-- If the denominator is zero we return primary=0 so the card shows "0%"
-- rather than collapsing to empty — "no activity" is not the same as
-- "every question refused". The secondary_text is used to disambiguate.
--
-- Comparison: prior window of equal length immediately preceding this one.
-- Sentiment: negative (up is bad) — set in the registry.

CREATE OR REPLACE FUNCTION ops.metric_aion_refusal_rate(
  p_workspace_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  primary_value numeric,
  secondary_text text,
  comparison_value numeric,
  comparison_label text,
  sparkline_values numeric[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'cortex', 'public', 'ops', 'pg_temp'
AS $$
DECLARE
  v_days integer := GREATEST(COALESCE(p_days, 30), 1);
  v_now timestamptz := now();
  v_curr_start timestamptz := v_now - make_interval(days => v_days);
  v_prev_start timestamptz := v_curr_start - make_interval(days => v_days);

  v_refusals_curr bigint;
  v_refusals_prev bigint;
  v_turns_curr bigint;
  v_turns_prev bigint;

  v_rate_curr numeric;
  v_rate_prev numeric;
  v_secondary text;
BEGIN
  -- Authz: authenticated callers must be workspace members.
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_refusals_curr
    FROM cortex.aion_refusal_log
    WHERE workspace_id = p_workspace_id
      AND created_at >= v_curr_start
      AND created_at <  v_now;

  SELECT count(*) INTO v_refusals_prev
    FROM cortex.aion_refusal_log
    WHERE workspace_id = p_workspace_id
      AND created_at >= v_prev_start
      AND created_at <  v_curr_start;

  -- User-role messages scoped to this workspace's sessions.
  SELECT count(*) INTO v_turns_curr
    FROM cortex.aion_messages m
    JOIN cortex.aion_sessions s ON s.id = m.session_id
    WHERE s.workspace_id = p_workspace_id
      AND m.role = 'user'
      AND m.created_at >= v_curr_start
      AND m.created_at <  v_now;

  SELECT count(*) INTO v_turns_prev
    FROM cortex.aion_messages m
    JOIN cortex.aion_sessions s ON s.id = m.session_id
    WHERE s.workspace_id = p_workspace_id
      AND m.role = 'user'
      AND m.created_at >= v_prev_start
      AND m.created_at <  v_curr_start;

  v_rate_curr := CASE
    WHEN v_turns_curr > 0 THEN (v_refusals_curr::numeric / v_turns_curr::numeric)
    ELSE 0
  END;
  v_rate_prev := CASE
    WHEN v_turns_prev > 0 THEN (v_refusals_prev::numeric / v_turns_prev::numeric)
    ELSE 0
  END;

  -- Human-readable secondary — surfaces the raw counts the percent was
  -- computed from, and disambiguates the "no activity" case.
  v_secondary := CASE
    WHEN v_turns_curr = 0 THEN 'No Aion activity in the last ' || v_days || ' days'
    ELSE v_refusals_curr || ' of ' || v_turns_curr || ' turns refused'
  END;

  RETURN QUERY SELECT
    v_rate_curr AS primary_value,
    v_secondary AS secondary_text,
    CASE WHEN v_turns_prev > 0 OR v_refusals_prev > 0 THEN v_rate_prev ELSE NULL END
      AS comparison_value,
    CASE WHEN v_turns_prev > 0 OR v_refusals_prev > 0
         THEN 'vs prior ' || v_days || ' days'
         ELSE NULL END AS comparison_label,
    NULL::numeric[] AS sparkline_values;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.metric_aion_refusal_rate(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ops.metric_aion_refusal_rate(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION ops.metric_aion_refusal_rate IS
  'Aion refusal rate over the last p_days window. Numerator: cortex.aion_refusal_log rows. Denominator: user-role messages in cortex.aion_messages. SECURITY DEFINER.';

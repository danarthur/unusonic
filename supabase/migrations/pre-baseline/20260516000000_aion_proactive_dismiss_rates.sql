-- =============================================================================
-- Proactive-line dismiss-rate telemetry — Phase 2 Sprint 2 / Week 6.
--
-- Rolling 7-day dismiss rate per (workspace, signal_type). Used for two
-- things:
--
--   1. Auto-disable gate inside the evaluator cron — if a signal type's
--      dismiss rate exceeds 35% on ≥3 emitted lines in the last 7 days,
--      the cron skips emitting that type for that workspace until the
--      rolling window forgets the bad run. Plan §3.2.4: "If dismiss-rate
--      > 35% on any signal type within 7 days, disable that type by default."
--
--   2. (Later) a lightweight admin surface for tuning. Not shipping now.
--
-- Minimum sample size (3) exists because one angry dismiss shouldn't mute a
-- type for a week. The plan's 35% threshold only makes sense above the noise
-- floor; 3 is the smallest integer where ratios are meaningful.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.get_proactive_line_dismiss_rates(
  p_workspace_id uuid,
  p_window_days  int  DEFAULT 7,
  p_min_sample   int  DEFAULT 3
)
RETURNS TABLE (
  signal_type      text,
  total_emitted    integer,
  total_dismissed  integer,
  dismiss_rate     numeric,
  above_threshold  boolean   -- true when rate > 0.35 AND total_emitted >= p_min_sample
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = cortex, public, pg_temp
AS $$
  WITH stats AS (
    SELECT
      pl.signal_type,
      COUNT(*)::int                                                   AS total_emitted,
      COUNT(*) FILTER (WHERE pl.dismissed_at IS NOT NULL)::int        AS total_dismissed
    FROM cortex.aion_proactive_lines pl
    WHERE pl.workspace_id = p_workspace_id
      AND pl.created_at   >= now() - make_interval(days => GREATEST(1, p_window_days))
    GROUP BY pl.signal_type
  )
  SELECT
    s.signal_type,
    s.total_emitted,
    s.total_dismissed,
    CASE WHEN s.total_emitted > 0
         THEN ROUND(s.total_dismissed::numeric / s.total_emitted::numeric, 4)
         ELSE 0::numeric
    END                                                               AS dismiss_rate,
    (
      s.total_emitted >= GREATEST(1, p_min_sample)
      AND (s.total_dismissed::numeric / NULLIF(s.total_emitted, 0)::numeric) > 0.35
    )                                                                 AS above_threshold
  FROM stats s;
$$;

COMMENT ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, int, int) IS
  'Phase 2 Sprint 2 telemetry: per-signal-type dismiss rate over a rolling window. above_threshold flags types with > 35% dismiss rate on ≥ p_min_sample emissions. Called by the evaluator cron to auto-disable noisy signals.';

REVOKE ALL ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, int, int)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, int, int)
  TO authenticated, service_role;

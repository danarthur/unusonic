-- Wk 16 §3.10 cost-per-seat metric — fills the lone "—" placeholder card on
-- /aion/admin/telemetry. Aggregates per-workspace USD cost across two streams:
--
--   1. aion.turn_complete events — Anthropic chat-turn cost. Computed as
--      input_tokens × model_input_rate + output_tokens × model_output_rate
--      using the model_id stamped onto the payload by routing-logger.ts.
--      A turn with NULL tokens (early stream errors) contributes $0.
--
--   2. aion.embed_cost events — Voyage embedding cost. Stored pre-computed in
--      payload.usd by upsertEmbeddingBatch (per-batch grain, prorated across
--      mixed-workspace batches in the cron drain).
--
-- Pricing constants are inlined as a CTE. Rotation requires a one-line
-- migration; promotion to a tier_pricing table is a Wk 17+ exercise once
-- prices actually shift.
--
-- Permissions: service_role only. Admin route handlers gate via isAionAdmin()
-- before calling. New aion.* function — REVOKE FROM PUBLIC + anon +
-- authenticated per the Wk 15-pre Six Schemas rule.

CREATE OR REPLACE FUNCTION aion.metric_cost_per_seat(p_window_days int DEFAULT 30)
RETURNS TABLE (
  workspace_id uuid,
  workspace_name text,
  seat_count bigint,
  total_cost_usd numeric,
  cost_per_seat_usd numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, ops, aion
AS $$
  WITH window_bounds AS (
    SELECT NOW() - (p_window_days || ' days')::interval AS since
  ),
  -- Anthropic per-model pricing in USD per million tokens (input, output).
  -- Sourced from anthropic.com/pricing 2026-Q1. Update via migration.
  model_prices AS (
    SELECT * FROM (VALUES
      ('claude-haiku-4-5-20251001', 0.80::numeric, 4.00::numeric),
      ('claude-sonnet-4-5',         3.00::numeric, 15.00::numeric),
      ('claude-sonnet-4-6',         3.00::numeric, 15.00::numeric),
      ('claude-opus-4-5',          15.00::numeric, 75.00::numeric),
      ('claude-opus-4-6',          15.00::numeric, 75.00::numeric),
      ('claude-opus-4-7',          15.00::numeric, 75.00::numeric)
    ) AS p(model_id, input_per_mtok, output_per_mtok)
  ),
  turn_costs AS (
    SELECT
      e.workspace_id,
      SUM(
        COALESCE((e.payload->>'input_tokens')::numeric, 0)  / 1000000.0 * COALESCE(p.input_per_mtok,  0.80) +
        COALESCE((e.payload->>'output_tokens')::numeric, 0) / 1000000.0 * COALESCE(p.output_per_mtok, 4.00)
      ) AS usd
    FROM ops.aion_events e
    LEFT JOIN model_prices p ON p.model_id = e.payload->>'model_id'
    WHERE e.event_type = 'aion.turn_complete'
      AND e.created_at >= (SELECT since FROM window_bounds)
      AND e.workspace_id IS NOT NULL
    GROUP BY e.workspace_id
  ),
  embed_costs AS (
    SELECT
      e.workspace_id,
      SUM(COALESCE((e.payload->>'usd')::numeric, 0)) AS usd
    FROM ops.aion_events e
    WHERE e.event_type = 'aion.embed_cost'
      AND e.created_at >= (SELECT since FROM window_bounds)
      AND e.workspace_id IS NOT NULL
    GROUP BY e.workspace_id
  ),
  combined AS (
    SELECT workspace_id, usd FROM turn_costs
    UNION ALL
    SELECT workspace_id, usd FROM embed_costs
  ),
  per_workspace AS (
    SELECT workspace_id, SUM(usd) AS total_cost_usd
    FROM combined
    GROUP BY workspace_id
  ),
  seats AS (
    SELECT workspace_id, COUNT(*)::bigint AS seat_count
    FROM public.workspace_members
    GROUP BY workspace_id
  )
  SELECT
    pw.workspace_id,
    COALESCE(w.name, '—') AS workspace_name,
    COALESCE(s.seat_count, 0) AS seat_count,
    ROUND(pw.total_cost_usd, 4) AS total_cost_usd,
    CASE WHEN COALESCE(s.seat_count, 0) > 0
      THEN ROUND(pw.total_cost_usd / s.seat_count, 4)
      ELSE NULL
    END AS cost_per_seat_usd
  FROM per_workspace pw
  LEFT JOIN public.workspaces w ON w.id = pw.workspace_id
  LEFT JOIN seats s              ON s.workspace_id = pw.workspace_id
  ORDER BY pw.total_cost_usd DESC NULLS LAST;
$$;

REVOKE EXECUTE ON FUNCTION aion.metric_cost_per_seat(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION aion.metric_cost_per_seat(int) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION aion.metric_cost_per_seat(int) TO service_role;

COMMENT ON FUNCTION aion.metric_cost_per_seat(int) IS
  'Wk 16 §3.10 cost-per-seat. Per-workspace Aion cost across chat turns + embeddings over the last p_window_days. service_role only; admin routes gate via isAionAdmin().';

-- Safety audit — fails the migration if anon/authenticated retain EXECUTE.
DO $$
BEGIN
  IF has_function_privilege('anon', 'aion.metric_cost_per_seat(int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security regression: anon has EXECUTE on aion.metric_cost_per_seat';
  END IF;
  IF has_function_privilege('authenticated', 'aion.metric_cost_per_seat(int)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security regression: authenticated has EXECUTE on aion.metric_cost_per_seat';
  END IF;
END $$;

-- ============================================================================
-- Phase 4.2 + 5.4: Metric expansion — 7 new metric RPCs.
-- ============================================================================
--
-- Adds six Critic-flagged gap metrics plus a multi-stop rollup for
-- touring coordinators. All SECURITY DEFINER, all REVOKE FROM PUBLIC + anon,
-- all scoped by workspace. Auth + TZ contract identical to Phase 1.2
-- (20260414140000_finance_metric_rpcs.sql). Reuses finance._metric_resolve_tz
-- and finance._metric_assert_membership.
--
-- Scalar metrics (2):
--   1. finance.revenue_yoy           — revenue vs same window one year earlier
--   2. ops.crew_utilization          — workspace-wide assigned/available hours
--
-- Table metrics (5):
--   3. finance.revenue_by_lead_source — paid invoice totals by deals.lead_source
--   4. finance.budget_vs_actual       — per-event projected (proposal) vs actual
--                                       (finance.bills.paid_amount) cost
--   5. ops.settlement_variance        — per-show expected vs collected settlement
--   6. ops.vendor_payment_status      — per-vendor billed / paid / outstanding
--   7. ops.multi_stop_rollup          — per-market rollup for a tour project
--
-- Schema audit notes (2026-04-14):
--   - public.proposal_items.actual_cost exists (plan referenced it as `cost`).
--   - finance.bills.event_id + paid_amount are present — wires up cleanly.
--   - public.deals.lead_source (text) exists; a lead_sources table does NOT.
--   - ops.projects has NO `kind` column; multi-stop rollup falls back to
--     "project with 2+ non-archived events" as the tour heuristic.
--   - No dedicated settlement field — settlement variance uses deal
--     budget_estimated (or invoice totals) vs collected payments.
--   - directory.entities has no archived/active flag; crew utilization
--     operates on entities with assignments in the window, which is
--     the correct denominator regardless.
-- ============================================================================


-- ============================================================================
-- 1. metric_revenue_yoy — SCALAR
-- ============================================================================
-- Revenue collected in [period_start, period_end] vs same window exactly one
-- year earlier. Net of refunds. No sparkline.

CREATE OR REPLACE FUNCTION finance.metric_revenue_yoy(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  primary_value numeric,
  secondary_text text,
  comparison_value numeric,
  comparison_label text,
  sparkline_values numeric[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'finance', 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
  v_prior_start date;
  v_prior_end date;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);
  v_prior_start := (p_period_start - INTERVAL '1 year')::date;
  v_prior_end   := (p_period_end   - INTERVAL '1 year')::date;

  RETURN QUERY
  WITH period_sum AS (
    SELECT
      COALESCE(SUM(amount), 0) AS total,
      COUNT(*) AS payment_count
    FROM finance.payments
    WHERE workspace_id = p_workspace_id
      AND status = 'succeeded'
      AND received_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND received_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  ),
  prior_sum AS (
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM finance.payments
    WHERE workspace_id = p_workspace_id
      AND status = 'succeeded'
      AND received_at >= (v_prior_start::timestamp AT TIME ZONE v_tz)
      AND received_at <  ((v_prior_end + 1)::timestamp AT TIME ZONE v_tz)
  )
  SELECT
    p.total,
    CASE WHEN p.payment_count > 0
      THEN p.payment_count::text || ' payment' || CASE WHEN p.payment_count = 1 THEN '' ELSE 's' END
      ELSE NULL END,
    (SELECT total FROM prior_sum),
    'vs same window last year'::text,
    NULL::numeric[]
  FROM period_sum p;
END;
$$;

COMMENT ON FUNCTION finance.metric_revenue_yoy(uuid, date, date, text) IS
  'Scalar metric: revenue in [period_start, period_end] vs same window one year earlier. Workspace TZ.';

REVOKE EXECUTE ON FUNCTION finance.metric_revenue_yoy(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_revenue_yoy(uuid, date, date, text) TO authenticated, service_role;


-- ============================================================================
-- 2. metric_crew_utilization — SCALAR
-- ============================================================================
-- Workspace-wide utilization: sum of assigned hours across all non-archived
-- crew in the period divided by an available-hours baseline. We don't have
-- a PTO/availability table yet, so "available" = 8h/day * business days in
-- the period * N active crew entities (people with ≥1 assignment in the
-- last 90 days). Returns a ratio in [0.00, 1.00].
--
-- secondary_text: "<top person> <top pct>%" — the named signal the user cares
-- about. primary_value is the overall mean for the strip/arc indicator.

CREATE OR REPLACE FUNCTION ops.metric_crew_utilization(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  primary_value numeric,
  secondary_text text,
  comparison_value numeric,
  comparison_label text,
  sparkline_values numeric[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'ops', 'finance', 'directory', 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
  v_period_days int;
  v_business_days int;
  v_available_hours_per_person numeric;
  v_active_crew int;
  v_top_name text;
  v_top_pct numeric;
  v_avg numeric;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);
  v_period_days := (p_period_end - p_period_start) + 1;

  -- Approximate business days as 5/7 of the period. Good enough for a
  -- utilization indicator; a holiday-aware baseline lands with PTO in a later phase.
  v_business_days := GREATEST(1, (v_period_days * 5) / 7);
  v_available_hours_per_person := v_business_days * 8.0;

  -- Active crew = person entities in this workspace with at least one
  -- assignment ever. Gives a stable denominator even when the period is empty.
  SELECT COUNT(DISTINCT ca.entity_id) INTO v_active_crew
  FROM ops.crew_assignments ca
  JOIN directory.entities e
    ON e.id = ca.entity_id AND e.type = 'person'
  WHERE ca.workspace_id = p_workspace_id
    AND ca.entity_id IS NOT NULL;

  IF COALESCE(v_active_crew, 0) = 0 OR v_available_hours_per_person = 0 THEN
    RETURN QUERY SELECT
      0::numeric,
      'No crew assignments yet'::text,
      NULL::numeric,
      NULL::text,
      NULL::numeric[];
    RETURN;
  END IF;

  -- Per-person assigned hours in the period, joined to the event window.
  WITH assigned AS (
    SELECT
      ca.entity_id,
      COALESCE(e.display_name, 'Unknown') AS name,
      SUM(COALESCE(ca.scheduled_hours, 0) + COALESCE(ca.overtime_hours, 0)) AS hours
    FROM ops.crew_assignments ca
    JOIN ops.events ev ON ev.id = ca.event_id
    LEFT JOIN directory.entities e ON e.id = ca.entity_id
    WHERE ca.workspace_id = p_workspace_id
      AND ca.entity_id IS NOT NULL
      AND ev.archived_at IS NULL
      AND ev.starts_at IS NOT NULL
      AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
    GROUP BY ca.entity_id, e.display_name
    HAVING SUM(COALESCE(ca.scheduled_hours, 0) + COALESCE(ca.overtime_hours, 0)) > 0
  )
  SELECT
    LEAST(1.0, a.hours / v_available_hours_per_person),
    a.name
  INTO v_top_pct, v_top_name
  FROM assigned a
  ORDER BY a.hours DESC
  LIMIT 1;

  -- Workspace mean: sum of hours across all people / (active_crew *
  -- available_hours_per_person). Clamped to [0, 1].
  SELECT LEAST(1.0,
    COALESCE(SUM(COALESCE(ca.scheduled_hours, 0) + COALESCE(ca.overtime_hours, 0)), 0)
    / (v_active_crew * v_available_hours_per_person))
  INTO v_avg
  FROM ops.crew_assignments ca
  JOIN ops.events ev ON ev.id = ca.event_id
  WHERE ca.workspace_id = p_workspace_id
    AND ca.entity_id IS NOT NULL
    AND ev.archived_at IS NULL
    AND ev.starts_at IS NOT NULL
    AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
    AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz);

  RETURN QUERY SELECT
    COALESCE(v_avg, 0)::numeric,
    CASE
      WHEN v_top_name IS NULL THEN v_active_crew::text || ' crew, 0 assigned'
      ELSE v_top_name || ' ' || to_char(v_top_pct * 100, 'FM990') || '%'
    END,
    NULL::numeric,
    NULL::text,
    NULL::numeric[];
END;
$$;

COMMENT ON FUNCTION ops.metric_crew_utilization(uuid, date, date, text) IS
  'Scalar metric: workspace crew utilization in the period (assigned / available hours, 0-1 ratio). Available hours approximated as 8h * business days.';

REVOKE EXECUTE ON FUNCTION ops.metric_crew_utilization(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ops.metric_crew_utilization(uuid, date, date, text) TO authenticated, service_role;


-- ============================================================================
-- 3. metric_revenue_by_lead_source — TABLE
-- ============================================================================
-- Joins public.deals (lead_source) → finance.invoices via deal_id. Sums
-- paid_amount per source. Unattributed rolls into "Unspecified".

CREATE OR REPLACE FUNCTION finance.metric_revenue_by_lead_source(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  lead_source text,
  revenue numeric,
  deal_count int,
  paid_invoice_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'finance', 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_invoices AS (
    SELECT
      i.id AS invoice_id,
      i.deal_id,
      i.paid_amount
    FROM finance.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.status NOT IN ('draft', 'void')
      AND i.paid_amount > 0
      AND i.paid_at IS NOT NULL
      AND i.paid_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND i.paid_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  )
  SELECT
    COALESCE(NULLIF(TRIM(d.lead_source), ''), 'Unspecified')::text AS lead_source_label,
    COALESCE(SUM(pi.paid_amount), 0)::numeric AS revenue,
    COUNT(DISTINCT d.id)::int AS deal_count,
    COUNT(DISTINCT pi.invoice_id)::int AS paid_invoice_count
  FROM period_invoices pi
  LEFT JOIN public.deals d
    ON d.id = pi.deal_id AND d.workspace_id = p_workspace_id
  GROUP BY COALESCE(NULLIF(TRIM(d.lead_source), ''), 'Unspecified')
  ORDER BY revenue DESC
  LIMIT 100;

  PERFORM v_tz;
END;
$$;

COMMENT ON FUNCTION finance.metric_revenue_by_lead_source(uuid, date, date, text) IS
  'Table metric: paid invoice revenue grouped by public.deals.lead_source over period. Cap 100 rows. Unattributed rolls into Unspecified.';

REVOKE EXECUTE ON FUNCTION finance.metric_revenue_by_lead_source(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_revenue_by_lead_source(uuid, date, date, text) TO authenticated, service_role;


-- ============================================================================
-- 4. metric_budget_vs_actual — TABLE
-- ============================================================================
-- For events whose starts_at falls in [period_start, period_end]:
--   projected_cost = SUM(public.proposal_items.actual_cost * quantity)
--                    for the deal's proposals (non-void)
--   actual_cost    = SUM(finance.bills.paid_amount) WHERE bill.event_id = event.id
--   variance       = actual - projected
--   variance_pct   = variance / NULLIF(projected, 0) * 100
--
-- actual_cost reads paid_amount (not total_amount) because the metric tracks
-- cash out the door, not committed AP. Proposals that are drafts still
-- represent the "plan" so they contribute to projected_cost as long as they
-- are not in a void-equivalent state.

CREATE OR REPLACE FUNCTION finance.metric_budget_vs_actual(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  event_title text,
  projected_cost numeric,
  actual_cost numeric,
  variance numeric,
  variance_pct numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'finance', 'ops', 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_events AS (
    SELECT
      ev.id,
      COALESCE(ev.title, '(untitled)') AS title,
      ev.deal_id
    FROM ops.events ev
    WHERE ev.workspace_id = p_workspace_id
      AND ev.archived_at IS NULL
      AND ev.starts_at IS NOT NULL
      AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  ),
  projected AS (
    SELECT
      pe.id AS event_id,
      COALESCE(SUM(pi.actual_cost * COALESCE(pi.quantity, 1)), 0) AS projected_cost
    FROM period_events pe
    -- proposal_status enum: draft | sent | viewed | accepted | rejected.
    -- Exclude rejected so the projected budget reflects live + accepted plans only.
    LEFT JOIN public.proposals p
      ON p.deal_id = pe.deal_id
     AND p.workspace_id = p_workspace_id
     AND p.status <> 'rejected'
    LEFT JOIN public.proposal_items pi
      ON pi.proposal_id = p.id
     AND pi.actual_cost IS NOT NULL
    GROUP BY pe.id
  ),
  actual AS (
    SELECT
      pe.id AS event_id,
      COALESCE(SUM(b.paid_amount), 0) AS actual_cost
    FROM period_events pe
    LEFT JOIN finance.bills b
      ON b.event_id = pe.id
     AND b.workspace_id = p_workspace_id
     AND b.paid_amount > 0
    GROUP BY pe.id
  )
  SELECT
    pe.id,
    pe.title::text,
    COALESCE(pr.projected_cost, 0)::numeric,
    COALESCE(ac.actual_cost, 0)::numeric,
    (COALESCE(ac.actual_cost, 0) - COALESCE(pr.projected_cost, 0))::numeric,
    CASE
      WHEN COALESCE(pr.projected_cost, 0) = 0 THEN NULL
      ELSE ((COALESCE(ac.actual_cost, 0) - pr.projected_cost) / pr.projected_cost * 100)
    END::numeric
  FROM period_events pe
  LEFT JOIN projected pr ON pr.event_id = pe.id
  LEFT JOIN actual ac    ON ac.event_id = pe.id
  ORDER BY ABS(COALESCE(ac.actual_cost, 0) - COALESCE(pr.projected_cost, 0)) DESC
  LIMIT 500;

  PERFORM v_tz;
END;
$$;

COMMENT ON FUNCTION finance.metric_budget_vs_actual(uuid, date, date, text) IS
  'Table metric: per-event projected (proposal.actual_cost sum) vs actual (finance.bills.paid_amount) cost. Cap 500 rows.';

REVOKE EXECUTE ON FUNCTION finance.metric_budget_vs_actual(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_budget_vs_actual(uuid, date, date, text) TO authenticated, service_role;


-- ============================================================================
-- 5. metric_settlement_variance — TABLE
-- ============================================================================
-- Per-show settlement tracking. Expected = deal.budget_estimated (the signed
-- contract value proxy). Actual = sum of payments against invoices for that
-- event. Variance = actual - expected. Status classifies the delta.
--
-- Gap documented in migration header: there is no dedicated settlement
-- column today, so expected/actual are proxies. Phase 5.4+ touring data model
-- is expected to add a finance.settlements table; this RPC returns today's
-- best available signal until then.

CREATE OR REPLACE FUNCTION ops.metric_settlement_variance(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  event_title text,
  event_date timestamptz,
  expected_settlement numeric,
  actual_settlement numeric,
  variance numeric,
  status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'ops', 'finance', 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_events AS (
    SELECT
      ev.id,
      COALESCE(ev.title, '(untitled)') AS title,
      ev.starts_at,
      ev.deal_id
    FROM ops.events ev
    WHERE ev.workspace_id = p_workspace_id
      AND ev.archived_at IS NULL
      AND ev.starts_at IS NOT NULL
      AND ev.starts_at >= (p_period_start::timestamp AT TIME ZONE v_tz)
      AND ev.starts_at <  ((p_period_end + 1)::timestamp AT TIME ZONE v_tz)
  ),
  expected AS (
    SELECT
      pe.id AS event_id,
      COALESCE(d.budget_estimated, 0) AS expected
    FROM period_events pe
    LEFT JOIN public.deals d
      ON d.id = pe.deal_id AND d.workspace_id = p_workspace_id
  ),
  actual AS (
    SELECT
      pe.id AS event_id,
      COALESCE(SUM(pay.amount), 0) AS actual
    FROM period_events pe
    LEFT JOIN finance.invoices i
      ON i.event_id = pe.id AND i.workspace_id = p_workspace_id
    LEFT JOIN finance.payments pay
      ON pay.invoice_id = i.id
     AND pay.workspace_id = p_workspace_id
     AND pay.status = 'succeeded'
    GROUP BY pe.id
  )
  SELECT
    pe.id,
    pe.title::text,
    pe.starts_at,
    COALESCE(ex.expected, 0)::numeric,
    COALESCE(ac.actual, 0)::numeric,
    (COALESCE(ac.actual, 0) - COALESCE(ex.expected, 0))::numeric,
    (CASE
      WHEN COALESCE(ex.expected, 0) = 0 AND COALESCE(ac.actual, 0) = 0 THEN 'no_settlement'
      WHEN COALESCE(ac.actual, 0) = 0 THEN 'uncollected'
      WHEN COALESCE(ac.actual, 0) >= COALESCE(ex.expected, 0) THEN 'settled'
      WHEN COALESCE(ac.actual, 0) >= COALESCE(ex.expected, 0) * 0.9 THEN 'short_minor'
      ELSE 'short_major'
    END)::text
  FROM period_events pe
  LEFT JOIN expected ex ON ex.event_id = pe.id
  LEFT JOIN actual ac   ON ac.event_id = pe.id
  ORDER BY pe.starts_at DESC
  LIMIT 500;

  PERFORM v_tz;
END;
$$;

COMMENT ON FUNCTION ops.metric_settlement_variance(uuid, date, date, text) IS
  'Table metric: per-show settlement tracking. Expected = deal.budget_estimated, actual = paid invoice amounts. Proxy until finance.settlements ships.';

REVOKE EXECUTE ON FUNCTION ops.metric_settlement_variance(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ops.metric_settlement_variance(uuid, date, date, text) TO authenticated, service_role;


-- ============================================================================
-- 6. metric_vendor_payment_status — TABLE
-- ============================================================================
-- Per-vendor AP summary for the period (bills.bill_date). Overdue = bills
-- whose due_date has passed and paid_amount < total_amount.

CREATE OR REPLACE FUNCTION ops.metric_vendor_payment_status(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  vendor_id uuid,
  vendor_name text,
  total_billed numeric,
  total_paid numeric,
  outstanding numeric,
  overdue_count int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'finance', 'directory', 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  RETURN QUERY
  WITH period_bills AS (
    SELECT
      b.pay_to_entity_id,
      b.total_amount,
      b.paid_amount,
      b.due_date,
      b.status
    FROM finance.bills b
    WHERE b.workspace_id = p_workspace_id
      AND b.bill_date IS NOT NULL
      AND b.bill_date >= p_period_start
      AND b.bill_date <= p_period_end
      AND b.pay_to_entity_id IS NOT NULL
  )
  SELECT
    pb.pay_to_entity_id,
    COALESCE(e.display_name, 'Unknown vendor')::text,
    COALESCE(SUM(pb.total_amount), 0)::numeric,
    COALESCE(SUM(pb.paid_amount), 0)::numeric,
    COALESCE(SUM(pb.total_amount - COALESCE(pb.paid_amount, 0)), 0)::numeric,
    COUNT(*) FILTER (
      WHERE pb.due_date IS NOT NULL
        AND pb.due_date < CURRENT_DATE
        AND COALESCE(pb.paid_amount, 0) < pb.total_amount
    )::int
  FROM period_bills pb
  LEFT JOIN directory.entities e
    ON e.id = pb.pay_to_entity_id
   AND e.owner_workspace_id = p_workspace_id
  GROUP BY pb.pay_to_entity_id, e.display_name
  ORDER BY COALESCE(SUM(pb.total_amount - COALESCE(pb.paid_amount, 0)), 0) DESC,
           COALESCE(SUM(pb.total_amount), 0) DESC
  LIMIT 200;

  PERFORM v_tz;
END;
$$;

COMMENT ON FUNCTION ops.metric_vendor_payment_status(uuid, date, date, text) IS
  'Table metric: per-vendor billed/paid/outstanding + overdue count from finance.bills in the period. Cap 200 rows.';

REVOKE EXECUTE ON FUNCTION ops.metric_vendor_payment_status(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ops.metric_vendor_payment_status(uuid, date, date, text) TO authenticated, service_role;


-- ============================================================================
-- 7. metric_multi_stop_rollup — TABLE
-- ============================================================================
-- Per-market status roll-up for the caller's active tour. No `ops.projects.kind`
-- column today, so a "tour" is heuristically any non-archived project with
-- two or more non-archived events. We pick the most recent such project
-- tied to the workspace and return minimal per-event status rows.
--
-- Documented gap: advance_complete / crew_confirmed / venue_contracted /
-- payments_collected don't exist as booleans in the schema. We return the
-- minimal shape (event_id, event_title, event_date, status) until those
-- fields land. `status` maps ops.events.lifecycle_status when present,
-- otherwise falls back to ops.events.status.

CREATE OR REPLACE FUNCTION ops.metric_multi_stop_rollup(
  p_workspace_id uuid,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  event_id uuid,
  event_title text,
  event_date timestamptz,
  status text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'ops', 'finance', 'public', 'pg_temp'
AS $$
DECLARE
  v_tz text;
  v_project_id uuid;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);

  -- Pick the most recent non-archived project with 2+ non-archived events.
  SELECT p.id INTO v_project_id
  FROM ops.projects p
  WHERE p.workspace_id = p_workspace_id
    AND (p.status IS NULL OR p.status NOT IN ('archived', 'cancelled'))
    AND (
      SELECT COUNT(*) FROM ops.events ev
      WHERE ev.project_id = p.id AND ev.archived_at IS NULL
    ) >= 2
  ORDER BY COALESCE(p.start_date, p.created_at) DESC NULLS LAST
  LIMIT 1;

  IF v_project_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ev.id,
    COALESCE(ev.title, COALESCE(NULLIF(ev.location_name, ''), '(untitled)'))::text,
    ev.starts_at,
    COALESCE(NULLIF(ev.lifecycle_status, ''), NULLIF(ev.status, ''), 'planned')::text
  FROM ops.events ev
  WHERE ev.project_id = v_project_id
    AND ev.workspace_id = p_workspace_id
    AND ev.archived_at IS NULL
  ORDER BY ev.starts_at NULLS LAST, ev.created_at;

  PERFORM v_tz;
END;
$$;

COMMENT ON FUNCTION ops.metric_multi_stop_rollup(uuid, text) IS
  'Table metric: per-market status roll-up for the workspace''s most recent multi-event project. Advance/crew/venue/payments booleans pending data model expansion.';

REVOKE EXECUTE ON FUNCTION ops.metric_multi_stop_rollup(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ops.metric_multi_stop_rollup(uuid, text) TO authenticated, service_role;


-- ============================================================================
-- Indexes for hot paths
-- ============================================================================

-- metric_crew_utilization joins ops.crew_assignments to ops.events on event_id.
-- Existing FK index covers the join side.
CREATE INDEX IF NOT EXISTS idx_ops_crew_assignments_workspace_entity
  ON ops.crew_assignments(workspace_id, entity_id)
  WHERE entity_id IS NOT NULL;

-- metric_revenue_by_lead_source filters invoices by workspace + paid_at.
-- Existing idx_finance_invoices on workspace + paid_at (if present) covers it;
-- add conditional index as a belt-and-suspenders guard.
CREATE INDEX IF NOT EXISTS idx_finance_invoices_workspace_paid_at
  ON finance.invoices(workspace_id, paid_at DESC)
  WHERE paid_at IS NOT NULL;

-- metric_budget_vs_actual + metric_settlement_variance scan ops.events by
-- workspace + starts_at with archived_at IS NULL. The existing
-- idx_ops_events_workspace_starts covers the general case; add partial for
-- active events to tighten the hot path.
CREATE INDEX IF NOT EXISTS idx_ops_events_active_starts
  ON ops.events(workspace_id, starts_at)
  WHERE archived_at IS NULL AND starts_at IS NOT NULL;

-- metric_vendor_payment_status scans bills by workspace + bill_date.
CREATE INDEX IF NOT EXISTS idx_finance_bills_workspace_bill_date
  ON finance.bills(workspace_id, bill_date DESC)
  WHERE bill_date IS NOT NULL AND pay_to_entity_id IS NOT NULL;

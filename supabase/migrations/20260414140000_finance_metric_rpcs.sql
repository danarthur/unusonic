-- ============================================================================
-- Phase 1.2: Eight named metric RPCs for Reports & Analytics
-- ============================================================================
--
-- All SECURITY DEFINER, REVOKE FROM PUBLIC + anon, scoped by workspace.
-- Auth contract:
--   - authenticated callers: workspace membership enforced via get_my_workspace_ids().
--   - service_role callers (auth.uid() IS NULL): pass through; grant model is the gate.
--     Used by Phase 3.3 pin-refresh cron and Phase 1.3 Reconciliation server actions.
--
-- TZ contract:
--   p_tz arg falls back to public.workspaces.timezone (default 'UTC').
--   Period-bound metrics use [period_start, period_end + 1) half-open ranges in the
--   resolved TZ to handle month/year boundary correctness.
--
-- Return shape contracts:
--   Scalar metrics (4): primary_value numeric, secondary_text text,
--     comparison_value numeric, comparison_label text, sparkline_values numeric[].
--     Renderer/callMetric formats per registry.unit; RPCs return raw values only.
--   Table metrics (4): per-RPC TABLE shape matching MetricDefinition.columns.
--
-- See: docs/reference/pages/reports-analytics-result-design.md §6
--      docs/reference/pages/reports-and-analytics-implementation-plan.md Phase 1.2
-- ============================================================================


-- ── helper: resolve TZ with fallback ────────────────────────────────────────
CREATE OR REPLACE FUNCTION finance._metric_resolve_tz(p_workspace_id uuid, p_tz text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
  SELECT COALESCE(p_tz, (SELECT timezone FROM public.workspaces WHERE id = p_workspace_id), 'UTC');
$$;

REVOKE EXECUTE ON FUNCTION finance._metric_resolve_tz(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance._metric_resolve_tz(uuid, text) TO authenticated, service_role;


-- ── helper: workspace membership guard ──────────────────────────────────────
-- Raises insufficient_privilege if the caller is authenticated but not a member.
-- service_role (auth.uid() IS NULL) passes through.
CREATE OR REPLACE FUNCTION finance._metric_assert_membership(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION finance._metric_assert_membership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance._metric_assert_membership(uuid) TO authenticated, service_role;


-- ============================================================================
-- 1. metric_revenue_collected — SCALAR
-- ============================================================================
-- Sum of finance.payments.amount where status='succeeded' and received_at falls
-- within [p_period_start, p_period_end] in the workspace TZ.
-- Net of refunds (refunds are negative-amount payment rows).
-- Comparison: prior period of equal length.

CREATE OR REPLACE FUNCTION finance.metric_revenue_collected(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL,
  p_compare boolean DEFAULT true
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
  v_period_days int;
  v_compare_start date;
  v_compare_end date;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);
  v_tz := finance._metric_resolve_tz(p_workspace_id, p_tz);
  v_period_days := (p_period_end - p_period_start) + 1;
  v_compare_start := p_period_start - v_period_days;
  v_compare_end := p_period_start - 1;

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
      AND received_at >= (v_compare_start::timestamp AT TIME ZONE v_tz)
      AND received_at <  ((v_compare_end + 1)::timestamp AT TIME ZONE v_tz)
  )
  SELECT
    p.total,
    CASE WHEN p.payment_count > 0 THEN p.payment_count::text || ' payments' ELSE NULL END,
    CASE WHEN p_compare THEN (SELECT total FROM prior_sum) ELSE NULL END,
    CASE WHEN p_compare THEN 'vs prior ' || v_period_days || ' days' ELSE NULL END,
    NULL::numeric[]
  FROM period_sum p;
END;
$$;

COMMENT ON FUNCTION finance.metric_revenue_collected(uuid, date, date, text, boolean) IS
  'Scalar metric: revenue collected (net of refunds) in [p_period_start, p_period_end] in workspace TZ.';

REVOKE EXECUTE ON FUNCTION finance.metric_revenue_collected(uuid, date, date, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_revenue_collected(uuid, date, date, text, boolean) TO authenticated, service_role;


-- ============================================================================
-- 2. metric_ar_aged_60plus — SCALAR
-- ============================================================================
-- Total balance_due across invoices with days_overdue >= 60 and balance > 0.
-- "As of now" — no period args. No comparison.

CREATE OR REPLACE FUNCTION finance.metric_ar_aged_60plus(
  p_workspace_id uuid
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
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    COALESCE(SUM(balance_due), 0)::numeric,
    CASE WHEN COUNT(*) > 0 THEN COUNT(*)::text || ' invoice' || CASE WHEN COUNT(*) = 1 THEN '' ELSE 's' END ELSE NULL END,
    NULL::numeric,
    NULL::text,
    NULL::numeric[]
  FROM finance.invoice_balances
  WHERE workspace_id = p_workspace_id
    AND days_overdue >= 60
    AND balance_due > 0;
END;
$$;

COMMENT ON FUNCTION finance.metric_ar_aged_60plus(uuid) IS
  'Scalar metric: total balance owed across invoices >= 60 days overdue. As-of-now.';

REVOKE EXECUTE ON FUNCTION finance.metric_ar_aged_60plus(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_ar_aged_60plus(uuid) TO authenticated, service_role;


-- ============================================================================
-- 3. metric_qbo_variance — SCALAR
-- ============================================================================
-- Count of invoices with QBO sync issues: failed sync or unsynced non-draft.
-- secondary_text shows last successful sync age.
-- No comparison.

CREATE OR REPLACE FUNCTION finance.metric_qbo_variance(
  p_workspace_id uuid
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
  v_last_sync timestamptz;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  SELECT last_sync_at INTO v_last_sync
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id AND status = 'active'
  LIMIT 1;

  RETURN QUERY
  WITH variance AS (
    SELECT COUNT(*) AS issue_count
    FROM finance.invoices
    WHERE workspace_id = p_workspace_id
      AND status NOT IN ('draft', 'void')
      AND (
        qbo_sync_status IN ('failed', 'dead_letter')
        OR (qbo_invoice_id IS NULL AND qbo_sync_status NOT IN ('excluded_pre_connection', 'not_synced'))
      )
  )
  SELECT
    v.issue_count::numeric,
    CASE
      WHEN v_last_sync IS NULL THEN 'No QBO connection'
      ELSE 'Last sync ' || to_char(v_last_sync AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') || ' UTC'
    END,
    NULL::numeric,
    NULL::text,
    NULL::numeric[]
  FROM variance v;
END;
$$;

COMMENT ON FUNCTION finance.metric_qbo_variance(uuid) IS
  'Scalar metric: count of invoices with QBO sync issues (failed, dead_letter, or unsynced non-draft).';

REVOKE EXECUTE ON FUNCTION finance.metric_qbo_variance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_qbo_variance(uuid) TO authenticated, service_role;


-- ============================================================================
-- 4. metric_qbo_sync_health — SCALAR
-- ============================================================================
-- Connection state with explicit "stalled" detection per Critic risk #2:
-- distinguishes "sync stalled" (token refresh hasn't happened in 24h) from
-- "sync failed" (connection alive but writes erroring).
-- primary_value: 1 if healthy, 0 otherwise.
-- secondary_text: human-readable status sentence.

CREATE OR REPLACE FUNCTION finance.metric_qbo_sync_health(
  p_workspace_id uuid
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
  v_conn record;
  v_recent_failures int;
  v_status_text text;
  v_healthy boolean;
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  SELECT status, last_refreshed_at, last_sync_at, last_sync_error
  INTO v_conn
  FROM finance.qbo_connections
  WHERE workspace_id = p_workspace_id
  ORDER BY connected_at DESC
  LIMIT 1;

  IF v_conn IS NULL THEN
    RETURN QUERY SELECT 0::numeric, 'Not connected'::text, NULL::numeric, NULL::text, NULL::numeric[];
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_recent_failures
  FROM finance.qbo_sync_log
  WHERE workspace_id = p_workspace_id
    AND started_at >= now() - INTERVAL '24 hours'
    AND qbo_response_status >= 400;

  v_healthy := v_conn.status = 'active'
    AND v_conn.last_refreshed_at IS NOT NULL
    AND v_conn.last_refreshed_at >= now() - INTERVAL '24 hours'
    AND v_recent_failures = 0;

  v_status_text := CASE
    WHEN v_conn.status <> 'active' THEN 'Connection ' || v_conn.status
    WHEN v_conn.last_refreshed_at IS NULL OR v_conn.last_refreshed_at < now() - INTERVAL '24 hours' THEN
      'Token refresh stalled'
    WHEN v_recent_failures > 0 THEN
      v_recent_failures::text || ' sync failure' || CASE WHEN v_recent_failures = 1 THEN '' ELSE 's' END || ' in last 24h'
    ELSE 'Healthy'
  END;

  RETURN QUERY SELECT
    CASE WHEN v_healthy THEN 1 ELSE 0 END::numeric,
    v_status_text,
    NULL::numeric,
    NULL::text,
    NULL::numeric[];
END;
$$;

COMMENT ON FUNCTION finance.metric_qbo_sync_health(uuid) IS
  'Scalar metric: QBO connection health. Distinguishes stalled (token refresh) from failed (writes erroring).';

REVOKE EXECUTE ON FUNCTION finance.metric_qbo_sync_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_qbo_sync_health(uuid) TO authenticated, service_role;


-- ============================================================================
-- 5. metric_unreconciled_payments — TABLE
-- ============================================================================
-- Payments that haven't been reflected in QBO yet. For Reconciliation surface.

CREATE OR REPLACE FUNCTION finance.metric_unreconciled_payments(
  p_workspace_id uuid
)
RETURNS TABLE (
  payment_id uuid,
  invoice_id uuid,
  invoice_number text,
  amount numeric,
  method text,
  received_at timestamptz,
  qbo_sync_status text,
  qbo_last_error text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'finance', 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    p.id,
    p.invoice_id,
    i.invoice_number,
    p.amount,
    p.method,
    p.received_at,
    p.qbo_sync_status,
    p.qbo_last_error
  FROM finance.payments p
  JOIN finance.invoices i ON i.id = p.invoice_id
  WHERE p.workspace_id = p_workspace_id
    AND p.status = 'succeeded'
    AND p.qbo_sync_status NOT IN ('synced', 'excluded_pre_connection')
  ORDER BY p.received_at DESC
  LIMIT 500;
END;
$$;

COMMENT ON FUNCTION finance.metric_unreconciled_payments(uuid) IS
  'Table metric: payments succeeded but not synced to QBO. Cap 500 rows.';

REVOKE EXECUTE ON FUNCTION finance.metric_unreconciled_payments(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_unreconciled_payments(uuid) TO authenticated, service_role;


-- ============================================================================
-- 6. metric_invoice_variance — TABLE
-- ============================================================================
-- Phase 1.2 scope: invoices with QBO sync issues. True local-vs-QBO variance
-- requires a live QBO API fetch and is deferred to Phase 5. The signature
-- accommodates a future qbo_total column without breaking callers.

CREATE OR REPLACE FUNCTION finance.metric_invoice_variance(
  p_workspace_id uuid
)
RETURNS TABLE (
  invoice_id uuid,
  invoice_number text,
  status text,
  local_total numeric,
  qbo_total numeric,
  delta numeric,
  qbo_sync_status text,
  qbo_last_error text,
  qbo_last_sync_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'finance', 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.status,
    i.total_amount,
    NULL::numeric AS qbo_total,    -- Phase 5 will populate via live QBO query
    NULL::numeric AS delta,
    i.qbo_sync_status,
    i.qbo_last_error,
    i.qbo_last_sync_at
  FROM finance.invoices i
  WHERE i.workspace_id = p_workspace_id
    AND i.status NOT IN ('draft', 'void')
    AND (
      i.qbo_sync_status IN ('failed', 'dead_letter')
      OR (i.qbo_invoice_id IS NULL AND i.qbo_sync_status NOT IN ('excluded_pre_connection', 'not_synced'))
      OR i.qbo_last_error IS NOT NULL
    )
  ORDER BY i.qbo_last_sync_at DESC NULLS LAST, i.created_at DESC
  LIMIT 500;
END;
$$;

COMMENT ON FUNCTION finance.metric_invoice_variance(uuid) IS
  'Table metric: invoices with QBO sync issues. qbo_total/delta are reserved for Phase 5 live-fetch.';

REVOKE EXECUTE ON FUNCTION finance.metric_invoice_variance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_invoice_variance(uuid) TO authenticated, service_role;


-- ============================================================================
-- 7. metric_sales_tax_worksheet — TABLE
-- ============================================================================
-- Per-jurisdiction sales tax for the period. Joins invoice line items'
-- qbo_tax_code_id to tax_rates to bucket by jurisdiction. Falls back to a
-- "Unspecified" bucket when no tax_code mapping exists.
-- Period-bound on invoice issue_date (NOT received_at — sales tax is on the sale).

CREATE OR REPLACE FUNCTION finance.metric_sales_tax_worksheet(
  p_workspace_id uuid,
  p_period_start date,
  p_period_end date,
  p_tz text DEFAULT NULL
)
RETURNS TABLE (
  jurisdiction text,
  tax_code text,
  taxable_amount numeric,
  tax_collected numeric,
  invoice_count int
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
    SELECT i.id, i.tax_amount, i.tax_rate_snapshot
    FROM finance.invoices i
    WHERE i.workspace_id = p_workspace_id
      AND i.status NOT IN ('draft', 'void')
      AND i.issue_date >= p_period_start
      AND i.issue_date <= p_period_end
  ),
  taxable_lines AS (
    SELECT
      li.invoice_id,
      li.qbo_tax_code_id,
      SUM(li.amount) AS taxable_total
    FROM finance.invoice_line_items li
    JOIN period_invoices pi ON pi.id = li.invoice_id
    WHERE li.is_taxable = true
    GROUP BY li.invoice_id, li.qbo_tax_code_id
  ),
  per_jurisdiction AS (
    SELECT
      COALESCE(tr.jurisdiction, 'Unspecified') AS jurisdiction_label,
      COALESCE(tl.qbo_tax_code_id, '—') AS tax_code_label,
      SUM(tl.taxable_total) AS sum_taxable,
      -- Apportion invoice tax across line items by taxable_total share.
      SUM(
        tl.taxable_total
        / NULLIF((SELECT SUM(taxable_total) FROM taxable_lines tl2 WHERE tl2.invoice_id = tl.invoice_id), 0)
        * (SELECT pi.tax_amount FROM period_invoices pi WHERE pi.id = tl.invoice_id)
      ) AS sum_collected,
      COUNT(DISTINCT tl.invoice_id) AS inv_count
    FROM taxable_lines tl
    LEFT JOIN finance.tax_rates tr
      ON tr.workspace_id = p_workspace_id
     AND tr.qbo_tax_code_id = tl.qbo_tax_code_id
    GROUP BY COALESCE(tr.jurisdiction, 'Unspecified'), COALESCE(tl.qbo_tax_code_id, '—')
  )
  SELECT
    pj.jurisdiction_label,
    pj.tax_code_label,
    COALESCE(pj.sum_taxable, 0)::numeric,
    COALESCE(pj.sum_collected, 0)::numeric,
    pj.inv_count::int
  FROM per_jurisdiction pj
  ORDER BY pj.jurisdiction_label, pj.tax_code_label;

  -- Suppress unused-variable warning when no rows match.
  PERFORM v_tz;
END;
$$;

COMMENT ON FUNCTION finance.metric_sales_tax_worksheet(uuid, date, date, text) IS
  'Table metric: sales tax by jurisdiction over period. Period bounded on issue_date. Apportions invoice.tax_amount across taxable lines.';

REVOKE EXECUTE ON FUNCTION finance.metric_sales_tax_worksheet(uuid, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_sales_tax_worksheet(uuid, date, date, text) TO authenticated, service_role;


-- ============================================================================
-- 8. metric_1099_worksheet — TABLE
-- ============================================================================
-- Per-vendor total paid in calendar year, joined to directory.entities for name.
-- Includes ALL vendors for transparency; consumer filters to >= $600 IRS threshold.
-- Reads finance.bills (AP). Future expansion: also include direct freelancer
-- payments via crew payment tracking (Phase 5).

CREATE OR REPLACE FUNCTION finance.metric_1099_worksheet(
  p_workspace_id uuid,
  p_year int
)
RETURNS TABLE (
  vendor_id uuid,
  vendor_name text,
  total_paid numeric,
  bill_count int,
  meets_1099_threshold boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'finance', 'directory', 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM finance._metric_assert_membership(p_workspace_id);

  RETURN QUERY
  WITH year_bills AS (
    SELECT b.pay_to_entity_id, b.paid_amount
    FROM finance.bills b
    WHERE b.workspace_id = p_workspace_id
      AND b.bill_date IS NOT NULL
      AND EXTRACT(YEAR FROM b.bill_date) = p_year
      AND b.paid_amount > 0
  )
  SELECT
    yb.pay_to_entity_id,
    COALESCE(e.display_name, 'Unknown vendor')::text AS vendor_name,
    COALESCE(SUM(yb.paid_amount), 0)::numeric AS total_paid,
    COUNT(*)::int AS bill_count,
    (COALESCE(SUM(yb.paid_amount), 0) >= 600)::boolean AS meets_1099_threshold
  FROM year_bills yb
  LEFT JOIN directory.entities e ON e.id = yb.pay_to_entity_id
  GROUP BY yb.pay_to_entity_id, e.display_name
  ORDER BY total_paid DESC;
END;
$$;

COMMENT ON FUNCTION finance.metric_1099_worksheet(uuid, int) IS
  'Table metric: per-vendor 1099 totals for calendar year. AP bills only; freelancer-direct path deferred to Phase 5.';

REVOKE EXECUTE ON FUNCTION finance.metric_1099_worksheet(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION finance.metric_1099_worksheet(uuid, int) TO authenticated, service_role;


-- ============================================================================
-- Indexes for hot paths
-- ============================================================================

-- metric_qbo_variance scans by workspace_id + qbo_sync_status. The existing
-- partial index excludes 'synced' and 'not_synced'; our query specifically wants
-- 'failed' and 'dead_letter', which the partial index covers.
-- No new index needed.

-- metric_revenue_collected sums by workspace_id + status + received_at. The
-- existing idx_finance_payments_received_at(workspace_id, received_at DESC)
-- covers the range scan; the status filter is fine on the heap.
-- No new index needed.

-- metric_ar_aged_60plus reads the invoice_balances view. Query plan tested
-- against current schema; view is a simple LEFT JOIN.
-- No new index needed.

-- metric_1099_worksheet groups by pay_to_entity_id + bill_date YEAR.
CREATE INDEX IF NOT EXISTS idx_finance_bills_pay_to_year
  ON finance.bills(workspace_id, pay_to_entity_id, bill_date)
  WHERE bill_date IS NOT NULL AND paid_amount > 0;

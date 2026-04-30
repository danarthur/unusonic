/**
 * Metric registry — single source of truth for what metrics exist, what they
 * return, who can call them, and how they render. callMetric() reads from here.
 *
 * Convention:
 *  - id is namespaced: '<schema>.<metric>' (matches the RPC name minus 'metric_').
 *  - argsSchema covers ONLY user-facing args. workspace_id is bound at call time.
 *  - requiredCapabilities are checked client-side as a fast-fail; the RPC's
 *    SECURITY DEFINER body enforces the real check via _metric_assert_membership
 *    + workspace RLS.
 *  - emptyState copy is what the analytics_result card / Reconciliation table
 *    renders when the RPC returns a zero or no rows.
 *
 * Definitions are split by kind under ./registry/ to keep this file under
 * the soft LOC limit while the registry keeps growing. Add new metrics to
 * the matching kind sibling (scalars / tables / widgets); this file just
 * merges them and exposes the cross-kind helpers (METRIC_IDS, RELATED_METRICS,
 * getRelatedMetricChips).
 *
 * @module shared/lib/metrics/registry
 */

import type { MetricDefinition } from './types';
import { SCALAR_METRICS } from './registry/scalars';
import { TABLE_METRICS } from './registry/tables';
import { WIDGET_METRICS } from './registry/widgets';

export const METRICS: Record<string, MetricDefinition> = {
  ...SCALAR_METRICS,
  ...TABLE_METRICS,
  ...WIDGET_METRICS,
};


/** All metric IDs as a const array — useful for tests and library filtering. */
export const METRIC_IDS = Object.keys(METRICS) as Array<keyof typeof METRICS>;

/**
 * Phase 4.3 — conversational follow-up graph.
 *
 * Maps each metric id to 2–3 related metric ids that make sense as the user's
 * next question. Resolved by `invokeCallMetric` and emitted inline on the
 * analytics_result / data_table response so the user sees "Try next" chips
 * beneath every answer. Rendered through the existing suggestions pipeline —
 * tapping a chip dispatches a chat turn asking for that metric.
 *
 * The resolver quietly drops any id the viewer lacks capability for, so it is
 * safe to list gated metrics here (finance.qbo_variance etc.) without leaking
 * their existence to users who can't call them.
 *
 * Design principle: a follow-up should either SHIFT the same metric in time,
 * EXPAND it (scalar → table drill-down), or PIVOT to a same-frame metric
 * (revenue → AR in finance-health frame). Picking ids that don't follow this
 * rule makes the suggestion feel random.
 */
export const RELATED_METRICS: Record<string, string[]> = {
  // ── Finance scalar ──────────────────────────────────────────────────────
  'finance.revenue_collected': [
    'finance.revenue_yoy',              // shift: same metric, YoY view
    'finance.ar_aged_60plus',           // pivot: income in → receivables out
    'finance.revenue_by_lead_source',   // drill: revenue broken down
  ],
  'finance.ar_aged_60plus': [
    'finance.revenue_collected',        // pivot: receivables → actual cash in
    'finance.unreconciled_payments',    // drill: what payments haven't landed
    'finance.qbo_variance',             // pivot: is QBO in sync with this?
  ],
  'finance.qbo_variance': [
    'finance.invoice_variance',         // drill: which invoices
    'finance.qbo_sync_health',          // pivot: why is sync off
    'finance.unreconciled_payments',    // drill: payment-side variance
  ],
  'finance.qbo_sync_health': [
    'finance.qbo_variance',             // drill: how many are affected
    'finance.invoice_variance',         // drill: specific invoices
  ],
  'finance.revenue_yoy': [
    'finance.revenue_collected',        // shift: drop the YoY, show raw
    'finance.revenue_by_lead_source',   // drill: what's driving YoY
  ],

  // ── Finance table ───────────────────────────────────────────────────────
  'finance.invoice_variance': [
    'finance.qbo_variance',             // shift: scalar count of the table
    'finance.qbo_sync_health',          // pivot: connection state
    'finance.unreconciled_payments',    // drill: payment-side
  ],
  'finance.unreconciled_payments': [
    'finance.qbo_variance',             // pivot: invoice-side
    'finance.invoice_variance',         // drill: specific invoices
    'finance.revenue_collected',        // pivot: what did actually land
  ],
  'finance.sales_tax_worksheet': [
    'finance.revenue_collected',        // pivot: what was the revenue base
    'finance.1099_worksheet',           // pivot: other filing-season worksheet
  ],
  'finance.1099_worksheet': [
    'ops.vendor_payment_status',        // drill: vendor-by-vendor status
    'finance.sales_tax_worksheet',      // pivot: other filing-season worksheet
  ],
  'finance.budget_vs_actual': [
    'finance.revenue_collected',        // pivot: revenue side of margin
    'finance.revenue_by_lead_source',   // pivot: attribution cut
    'ops.vendor_payment_status',        // drill: what did we pay out
  ],
  'finance.revenue_by_lead_source': [
    'finance.revenue_collected',        // shift: unsegmented total
    'finance.revenue_yoy',              // shift: yoy comparison
  ],

  // ── Ops ─────────────────────────────────────────────────────────────────
  'ops.crew_utilization': [
    'ops.aion_refusal_rate',            // owner-oversight frame
  ],
  'ops.settlement_variance': [
    'ops.vendor_payment_status',        // pivot: money-out side
    'ops.multi_stop_rollup',            // drill: per-market breakdown
  ],
  'ops.vendor_payment_status': [
    'finance.1099_worksheet',           // pivot: same vendor list, different lens
    'ops.settlement_variance',          // pivot: money-in side
  ],
  'ops.multi_stop_rollup': [
    'ops.settlement_variance',          // drill: financial variance per market
    'ops.vendor_payment_status',        // drill: vendor status
  ],
  'ops.aion_refusal_rate': [
    // Owner-only oversight metric; no natural related peers yet.
  ],
};

/**
 * Resolve a metric's related follow-up ids to SuggestionChip-shape objects,
 * filtering out any the viewer lacks capability for. Returns [] when the
 * metric has no declared relatedMetrics or all are filtered out.
 */
export function getRelatedMetricChips(
  metricId: string,
  userCapabilities: Set<string>,
): Array<{ label: string; value: string; metricId: string }> {
  const ids = RELATED_METRICS[metricId] ?? [];
  return ids
    .map((id) => METRICS[id])
    .filter((def): def is MetricDefinition => def != null)
    .filter((def) => def.requiredCapabilities.every((cap) => userCapabilities.has(cap)))
    .slice(0, 3) // cap at 3 per spec
    .map((def) => ({
      // User-facing label: the metric's title, lowercased for "Try next: <x>" flow.
      label: def.title,
      // Value is what the chat pipeline dispatches when the user taps the chip —
      // a synthetic user message that Aion's call_metric tool picks up cleanly.
      value: `Show me ${def.title.toLowerCase()}`,
      metricId: def.id,
    }));
}

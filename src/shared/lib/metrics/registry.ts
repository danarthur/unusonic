/**
 * Metric registry — Phase 1.2 seed.
 *
 * The single source of truth for what metrics exist, what they return, who
 * can call them, and how they render. callMetric() reads from here.
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
 * @module shared/lib/metrics/registry
 */

import { z } from 'zod';
import type { MetricDefinition } from './types';

const periodSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  tz: z.string().optional(),
  compare: z.boolean().optional(),
});

const noArgsSchema = z.object({});

const yearSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

const daysWindowSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});

/**
 * Widget-kind entries use `lobby.*` IDs to namespace them away from RPC metrics.
 * They catalog existing widget folders under `src/widgets/` so the Phase 2.3
 * "swap from library" picker can filter by the viewer's capabilities and role.
 * No RPC runs when these IDs are resolved — the widget owns its own data fetch.
 */
export const METRICS: Record<string, MetricDefinition> = {
  // ── Scalar metrics ─────────────────────────────────────────────────────────

  'finance.revenue_collected': {
    id: 'finance.revenue_collected',
    kind: 'scalar',
    rpcSchema: 'finance',
    rpcName: 'metric_revenue_collected',
    argsSchema: periodSchema,
    defaultArgs: { compare: true },
    unit: 'currency',
    comparisonSentiment: 'positive',
    hasSparkline: false,
    requiredCapabilities: ['finance:view'],
    refreshability: 'hourly',
    roles: ['owner', 'finance_admin'],
    title: 'Revenue collected',
    description: 'Net of refunds. Counts payments received in the period in your workspace timezone.',
    emptyState: {
      title: 'No payments yet',
      body: 'Payments received in this period will roll up here.',
    },
  },

  'finance.ar_aged_60plus': {
    id: 'finance.ar_aged_60plus',
    kind: 'scalar',
    rpcSchema: 'finance',
    rpcName: 'metric_ar_aged_60plus',
    argsSchema: noArgsSchema,
    unit: 'currency',
    comparisonSentiment: 'negative',
    hasSparkline: false,
    requiredCapabilities: ['finance:view'],
    refreshability: 'daily',
    roles: ['owner', 'finance_admin'],
    title: 'AR aged 60+ days',
    description: 'Total balance owed across invoices more than 60 days overdue. As of right now.',
    emptyState: {
      title: 'Nothing overdue',
      body: 'No invoices are aged 60 days or more. Nice.',
    },
  },

  'finance.qbo_variance': {
    id: 'finance.qbo_variance',
    kind: 'scalar',
    rpcSchema: 'finance',
    rpcName: 'metric_qbo_variance',
    widgetKey: 'qbo-variance',
    argsSchema: noArgsSchema,
    unit: 'count',
    comparisonSentiment: 'negative',
    hasSparkline: false,
    requiredCapabilities: ['finance:view', 'finance:reconcile'],
    refreshability: 'hourly',
    roles: ['finance_admin'],
    title: 'QBO sync issues',
    description: 'Invoices that failed to sync to QuickBooks Online or are stuck in an unsynced state.',
    emptyState: {
      title: 'All synced',
      body: 'Every invoice is up to date with QuickBooks.',
    },
    notes: 'Excludes draft and void invoices.',
  },

  'finance.qbo_sync_health': {
    id: 'finance.qbo_sync_health',
    kind: 'scalar',
    rpcSchema: 'finance',
    rpcName: 'metric_qbo_sync_health',
    argsSchema: noArgsSchema,
    unit: 'count',
    comparisonSentiment: 'positive',
    hasSparkline: false,
    requiredCapabilities: ['finance:view', 'finance:reconcile'],
    refreshability: 'hourly',
    roles: ['finance_admin'],
    title: 'QBO connection health',
    description: 'Whether the QuickBooks connection is alive, the token has refreshed recently, and recent sync calls succeeded.',
    emptyState: {
      title: 'Not connected',
      body: 'Connect QuickBooks in Settings → Finance to reconcile your books.',
      cta: { label: 'Connect QuickBooks', href: '/finance/settings' },
    },
  },

  'ops.aion_refusal_rate': {
    id: 'ops.aion_refusal_rate',
    kind: 'scalar',
    rpcSchema: 'ops',
    rpcName: 'metric_aion_refusal_rate',
    widgetKey: 'aion-refusal-rate',
    argsSchema: daysWindowSchema,
    defaultArgs: { days: 30 },
    unit: 'percent',
    comparisonSentiment: 'negative', // up = bad
    hasSparkline: false,
    requiredCapabilities: ['workspace:owner'],
    refreshability: 'daily',
    roles: ['owner'],
    title: 'Aion refusal rate',
    description:
      'Share of Aion questions where the metric was out of registry scope. Alert if above 10% over 30 days.',
    emptyState: {
      title: 'No refusals yet',
      body: 'Aion has answered every question so far.',
    },
  },

  // Phase 4.2 — revenue YoY comparison. Widget-backed for the Lobby hero card.
  'finance.revenue_yoy': {
    id: 'finance.revenue_yoy',
    kind: 'scalar',
    rpcSchema: 'finance',
    rpcName: 'metric_revenue_yoy',
    widgetKey: 'revenue-yoy',
    argsSchema: periodSchema.omit({ compare: true }),
    unit: 'currency',
    comparisonSentiment: 'positive',
    hasSparkline: false,
    requiredCapabilities: ['finance:view'],
    refreshability: 'daily',
    roles: ['owner', 'finance_admin'],
    title: 'Revenue YoY',
    description:
      'Revenue collected in the selected window vs the same window one year earlier. Net of refunds.',
    emptyState: {
      title: 'No year-over-year comparison yet',
      body: 'Once there are payments in both this window and last year, the delta lights up here.',
    },
  },

  // Phase 4.2 — workspace-wide crew utilization. Owns the crew-utilization widget.
  'ops.crew_utilization': {
    id: 'ops.crew_utilization',
    kind: 'scalar',
    rpcSchema: 'ops',
    rpcName: 'metric_crew_utilization',
    widgetKey: 'crew-utilization',
    argsSchema: periodSchema.omit({ compare: true }),
    unit: 'percent',
    comparisonSentiment: 'positive',
    hasSparkline: false,
    requiredCapabilities: ['planning:view'],
    refreshability: 'daily',
    roles: ['owner', 'pm'],
    title: 'Crew utilization',
    description:
      'Workspace-wide ratio of assigned crew hours to available hours in the period. Secondary line names the top-utilized crew member.',
    emptyState: {
      title: 'No crew assignments yet',
      body: 'Utilization appears once shows are staffed with scheduled hours on each assignment.',
    },
    notes:
      'Available hours approximated as 8h × business days (5/7 of period). Holiday/PTO-aware baseline lands with the availability model.',
  },

  // ── Table metrics ──────────────────────────────────────────────────────────

  'finance.unreconciled_payments': {
    id: 'finance.unreconciled_payments',
    kind: 'table',
    rpcSchema: 'finance',
    rpcName: 'metric_unreconciled_payments',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view', 'finance:reconcile'],
    refreshability: 'manual',
    roles: ['finance_admin'],
    title: 'Unreconciled payments',
    description: 'Payments that succeeded in Unusonic but have not been reflected in QuickBooks yet.',
    emptyState: {
      title: 'All payments reconciled',
      body: 'Every received payment has a QuickBooks counterpart.',
    },
    columns: [
      { key: 'invoice_number', label: 'Invoice', align: 'left', format: 'text' },
      { key: 'amount', label: 'Amount', align: 'right', format: 'currency' },
      { key: 'method', label: 'Method', align: 'left', format: 'text' },
      { key: 'received_at', label: 'Received', align: 'left', format: 'date' },
      { key: 'qbo_sync_status', label: 'Sync status', align: 'left', format: 'text' },
      { key: 'qbo_last_error', label: 'Last error', align: 'left', format: 'text' },
    ],
    exportable: true,
    notes: 'Cap of 500 rows on the RPC.',
  },

  'finance.invoice_variance': {
    id: 'finance.invoice_variance',
    kind: 'table',
    rpcSchema: 'finance',
    rpcName: 'metric_invoice_variance',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view', 'finance:reconcile'],
    refreshability: 'manual',
    roles: ['finance_admin'],
    title: 'Invoice variance',
    description: 'Invoices with QuickBooks sync issues. True local-vs-QBO variance comparison ships in Phase 5.',
    emptyState: {
      title: 'No variance detected',
      body: 'Every non-draft invoice synced cleanly.',
    },
    columns: [
      { key: 'invoice_number', label: 'Invoice', align: 'left', format: 'text' },
      { key: 'status', label: 'Status', align: 'left', format: 'text' },
      { key: 'local_total', label: 'Local total', align: 'right', format: 'currency' },
      { key: 'qbo_total', label: 'QBO total', align: 'right', format: 'currency' },
      { key: 'delta', label: 'Δ', align: 'right', format: 'currency' },
      { key: 'qbo_sync_status', label: 'Sync', align: 'left', format: 'text' },
      { key: 'qbo_last_error', label: 'Last error', align: 'left', format: 'text' },
      { key: 'qbo_last_sync_at', label: 'Last sync', align: 'left', format: 'date' },
    ],
    exportable: true,
    notes: 'qbo_total and delta are NULL until Phase 5 wires live QBO fetch.',
  },

  'finance.sales_tax_worksheet': {
    id: 'finance.sales_tax_worksheet',
    kind: 'table',
    rpcSchema: 'finance',
    rpcName: 'metric_sales_tax_worksheet',
    argsSchema: periodSchema.omit({ compare: true }),
    requiredCapabilities: ['finance:view', 'finance:reconcile'],
    refreshability: 'manual',
    roles: ['finance_admin'],
    title: 'Sales tax worksheet',
    description: 'Sales tax collected by jurisdiction over the period. Period bounded on invoice issue date.',
    emptyState: {
      title: 'No taxable invoices',
      body: 'No invoices with taxable line items were issued in this period.',
    },
    columns: [
      { key: 'jurisdiction', label: 'Jurisdiction', align: 'left', format: 'text' },
      { key: 'tax_code', label: 'Tax code', align: 'left', format: 'text' },
      { key: 'taxable_amount', label: 'Taxable', align: 'right', format: 'currency' },
      { key: 'tax_collected', label: 'Tax collected', align: 'right', format: 'currency' },
      { key: 'invoice_count', label: 'Invoices', align: 'right', format: 'count' },
    ],
    exportable: true,
    notes: 'Apportions invoice.tax_amount across taxable lines by share. Lines without a tax_code roll into "Unspecified".',
  },

  'finance.1099_worksheet': {
    id: 'finance.1099_worksheet',
    kind: 'table',
    rpcSchema: 'finance',
    rpcName: 'metric_1099_worksheet',
    argsSchema: yearSchema,
    requiredCapabilities: ['finance:view', 'finance:reconcile'],
    refreshability: 'manual',
    roles: ['finance_admin'],
    title: '1099 worksheet',
    description: 'Per-vendor totals paid in the calendar year. Flags vendors who meet the $600 IRS threshold.',
    emptyState: {
      title: 'No vendor bills paid',
      body: 'No bills were paid in this calendar year. The freelancer-direct payment path lands in Phase 5.',
    },
    columns: [
      { key: 'vendor_name', label: 'Vendor', align: 'left', format: 'text' },
      { key: 'total_paid', label: 'Total paid', align: 'right', format: 'currency' },
      { key: 'bill_count', label: 'Bills', align: 'right', format: 'count' },
      { key: 'meets_1099_threshold', label: '≥ $600', align: 'left', format: 'text' },
    ],
    exportable: true,
    notes: 'Reads finance.bills (AP). Direct freelancer payments are out of scope until Phase 5.',
  },

  // Phase 4.2 — paid invoice revenue by public.deals.lead_source.
  'finance.revenue_by_lead_source': {
    id: 'finance.revenue_by_lead_source',
    kind: 'table',
    rpcSchema: 'finance',
    rpcName: 'metric_revenue_by_lead_source',
    argsSchema: periodSchema.omit({ compare: true }),
    requiredCapabilities: ['finance:view'],
    refreshability: 'daily',
    roles: ['owner'],
    title: 'Revenue by lead source',
    description:
      'Paid invoice revenue grouped by public.deals.lead_source for deals paid in the period. Unattributed deals roll into Unspecified.',
    emptyState: {
      title: 'No attributed revenue',
      body: 'Once deals with a lead source generate paid invoices, revenue shows up here by source.',
    },
    columns: [
      { key: 'lead_source', label: 'Lead source', align: 'left', format: 'text' },
      { key: 'revenue', label: 'Revenue', align: 'right', format: 'currency' },
      { key: 'deal_count', label: 'Deals', align: 'right', format: 'count' },
      { key: 'paid_invoice_count', label: 'Paid invoices', align: 'right', format: 'count' },
    ],
    exportable: true,
    notes:
      'Attribution reads the text column public.deals.lead_source (no lead_sources lookup table exists yet). Cap 100 rows.',
  },

  // Phase 4.2 — per-event projected vs actual cost.
  'finance.budget_vs_actual': {
    id: 'finance.budget_vs_actual',
    kind: 'table',
    rpcSchema: 'finance',
    rpcName: 'metric_budget_vs_actual',
    argsSchema: periodSchema.omit({ compare: true }),
    requiredCapabilities: ['finance:view'],
    refreshability: 'hourly',
    roles: ['owner', 'finance_admin', 'pm'],
    title: 'Budget vs actual',
    description:
      'Per-event projected cost (from non-rejected proposal items) vs actual cost (from paid bills). Variance + variance percent flag overruns.',
    emptyState: {
      title: 'No events in this window',
      body: 'Budget-vs-actual appears once shows in this period have proposal costs or paid bills.',
    },
    columns: [
      { key: 'event_title', label: 'Event', align: 'left', format: 'text' },
      { key: 'projected_cost', label: 'Projected', align: 'right', format: 'currency' },
      { key: 'actual_cost', label: 'Actual', align: 'right', format: 'currency' },
      { key: 'variance', label: 'Variance', align: 'right', format: 'currency' },
      { key: 'variance_pct', label: 'Variance %', align: 'right', format: 'percent' },
    ],
    exportable: true,
    notes:
      'Projected reads public.proposal_items.actual_cost * quantity (columns named actual_cost historically; the value is the projected cost for a line item). Actual reads finance.bills.paid_amount keyed by event_id. Cap 500 rows.',
  },

  // Phase 5.4 — per-show settlement tracking (tour coordinator primary).
  'ops.settlement_variance': {
    id: 'ops.settlement_variance',
    kind: 'table',
    rpcSchema: 'ops',
    rpcName: 'metric_settlement_variance',
    argsSchema: periodSchema.omit({ compare: true }),
    requiredCapabilities: ['finance:view'],
    refreshability: 'hourly',
    roles: ['touring_coordinator'],
    title: 'Settlement variance',
    description:
      'Per-show expected vs collected settlement, plus variance and status. Expected falls back to deal.budget_estimated; actual is paid invoice amounts.',
    emptyState: {
      title: 'No settlements to track',
      body: 'Settlement variance appears once shows in this period have a deal value and collected payments.',
    },
    columns: [
      { key: 'event_title', label: 'Show', align: 'left', format: 'text' },
      { key: 'event_date', label: 'Date', align: 'left', format: 'date' },
      { key: 'expected_settlement', label: 'Expected', align: 'right', format: 'currency' },
      { key: 'actual_settlement', label: 'Actual', align: 'right', format: 'currency' },
      { key: 'variance', label: 'Variance', align: 'right', format: 'currency' },
      { key: 'status', label: 'Status', align: 'left', format: 'text' },
    ],
    exportable: true,
    notes:
      'Proxy metric: there is no finance.settlements table today. Expected = deal.budget_estimated, actual = sum of succeeded payments against the event invoices. A dedicated settlement model lands in a later phase. Cap 500 rows.',
  },

  // Phase 5.4 — per-vendor AP summary for a period.
  'ops.vendor_payment_status': {
    id: 'ops.vendor_payment_status',
    kind: 'table',
    rpcSchema: 'ops',
    rpcName: 'metric_vendor_payment_status',
    argsSchema: periodSchema.omit({ compare: true }),
    requiredCapabilities: ['finance:view'],
    refreshability: 'hourly',
    roles: ['touring_coordinator', 'finance_admin'],
    title: 'Vendor payment status',
    description:
      'Per-vendor billed, paid, outstanding, and overdue bill count for bills dated in the period.',
    emptyState: {
      title: 'No vendor bills yet',
      body: 'Vendor payment status appears once bills dated in this period have a pay-to vendor attached.',
    },
    columns: [
      { key: 'vendor_name', label: 'Vendor', align: 'left', format: 'text' },
      { key: 'total_billed', label: 'Billed', align: 'right', format: 'currency' },
      { key: 'total_paid', label: 'Paid', align: 'right', format: 'currency' },
      { key: 'outstanding', label: 'Outstanding', align: 'right', format: 'currency' },
      { key: 'overdue_count', label: 'Overdue', align: 'right', format: 'count' },
    ],
    exportable: true,
    notes: 'Reads finance.bills joined to directory.entities.display_name. Cap 200 rows.',
  },

  // Phase 5.4 — multi-stop per-market rollup for the most recent active tour.
  'ops.multi_stop_rollup': {
    id: 'ops.multi_stop_rollup',
    kind: 'table',
    rpcSchema: 'ops',
    rpcName: 'metric_multi_stop_rollup',
    argsSchema: z.object({ tz: z.string().optional() }),
    requiredCapabilities: ['planning:view'],
    refreshability: 'hourly',
    roles: ['touring_coordinator'],
    title: 'Multi-stop rollup',
    description:
      "Per-market status list for the workspace's most recent active multi-event project. Picks the project with the most recent start date that has two or more events.",
    emptyState: {
      title: 'No active tour detected',
      body: 'Create a project with two or more events to see the per-market rollup here.',
    },
    columns: [
      { key: 'event_title', label: 'Market', align: 'left', format: 'text' },
      { key: 'event_date', label: 'Date', align: 'left', format: 'date' },
      { key: 'status', label: 'Status', align: 'left', format: 'text' },
    ],
    exportable: true,
    notes:
      'Minimal shape until the touring data model adds advance_complete / crew_confirmed / venue_contracted / payments_collected booleans. No ops.projects.kind column today, so the active tour is heuristically the most recent non-archived project with ≥2 non-archived events.',
  },

  // ── Widget-kind entries (Phase 2.1 library manifest) ───────────────────────
  // IDs use the `lobby.` namespace; `widgetKey` matches the folder under
  // `src/widgets/`. These cards own their own data fetch; the registry entry
  // only exists so the library picker + role-default resolver can reason about
  // them. Grouped by domain for review.

  // Finance / revenue cards -------------------------------------------------

  'lobby.financial_pulse': {
    id: 'lobby.financial_pulse',
    kind: 'widget',
    widgetKey: 'financial-pulse',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Financial pulse',
    description: 'Outstanding receivables, money in, money out. Rolling snapshot.',
    emptyState: {
      title: 'No financial activity yet',
      body: 'Once you issue your first invoice or receive a payment, this card will surface receivables and cash movement.',
    },
  },

  'lobby.revenue_trend': {
    id: 'lobby.revenue_trend',
    kind: 'widget',
    widgetKey: 'revenue-trend',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Revenue trend',
    description: 'Revenue booked by month, trailing window. Tracks the slope of the business.',
    emptyState: {
      title: 'Not enough history',
      body: 'Revenue trend appears once you have at least two months of paid invoices.',
    },
  },

  'lobby.payment_health': {
    id: 'lobby.payment_health',
    kind: 'widget',
    widgetKey: 'payment-health',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Payment health',
    description: 'On-time vs late invoice mix for the workspace. High-signal signal for AR risk.',
    emptyState: {
      title: 'No invoices issued yet',
      body: 'Payment health lights up after your first issued invoice matures.',
    },
  },

  'lobby.client_concentration': {
    id: 'lobby.client_concentration',
    kind: 'widget',
    widgetKey: 'client-concentration',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view', 'deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin'],
    title: 'Top clients',
    description: 'Revenue share by top accounts. Surfaces single-client risk.',
    emptyState: {
      title: 'No billable clients yet',
      body: 'Once deals close and invoice, your top clients will rank here.',
    },
  },

  'lobby.event_roi_snapshot': {
    id: 'lobby.event_roi_snapshot',
    kind: 'widget',
    widgetKey: 'event-roi-snapshot',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['owner', 'finance_admin', 'pm'],
    title: 'Event ROI',
    description: 'Revenue vs cost per event. Flags margin drift show-over-show.',
    emptyState: {
      title: 'No completed events with costs',
      body: 'ROI appears once an event has both billed revenue and recorded costs.',
    },
  },

  // Pipeline / sales cards --------------------------------------------------

  'lobby.deal_pipeline': {
    id: 'lobby.deal_pipeline',
    kind: 'widget',
    widgetKey: 'deal-pipeline',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin'],
    title: 'Pipeline',
    description: 'Open deals by stage, weighted value, and stage counts.',
    emptyState: {
      title: 'Pipeline is clear',
      body: 'Create a deal to see your pipeline take shape.',
    },
  },

  'lobby.pipeline_velocity': {
    id: 'lobby.pipeline_velocity',
    kind: 'widget',
    widgetKey: 'pipeline-velocity',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Pipeline velocity',
    description: 'Average time deals spend in each stage. Bottleneck detector.',
    emptyState: {
      title: 'Not enough stage history',
      body: 'Once deals have moved through multiple stages, their cadence appears here.',
    },
  },

  'lobby.passive_pipeline_feed': {
    id: 'lobby.passive_pipeline_feed',
    kind: 'widget',
    widgetKey: 'passive-pipeline-feed',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Pipeline feed',
    description: 'Low-attention feed of recent pipeline movement — stage changes, proposal sends, new deals.',
    emptyState: {
      title: 'Quiet in the pipeline',
      body: 'Activity shows up here as deals move.',
    },
  },

  // Schedule / ops cards ----------------------------------------------------

  'lobby.today_schedule': {
    id: 'lobby.today_schedule',
    kind: 'widget',
    widgetKey: 'today-schedule',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Today',
    description: 'Events, calls, and load-ins scheduled for today in workspace timezone.',
    emptyState: {
      title: 'Nothing on today',
      body: 'Your workspace has no events scheduled for today.',
    },
  },

  'lobby.week_strip': {
    id: 'lobby.week_strip',
    kind: 'widget',
    widgetKey: 'week-strip',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'This week',
    description: 'Seven-day strip of scheduled events and major calls.',
    emptyState: {
      title: 'No events this week',
      body: 'Events scheduled in the next seven days will appear here.',
    },
  },

  'lobby.urgency_strip': {
    id: 'lobby.urgency_strip',
    kind: 'widget',
    widgetKey: 'urgency-strip',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Urgency',
    description: 'Deals, events, and invoices that need attention now.',
    emptyState: {
      title: 'Nothing urgent',
      body: 'Urgent items will surface at the top of your lobby when they appear.',
    },
  },

  'lobby.action_queue': {
    id: 'lobby.action_queue',
    kind: 'widget',
    widgetKey: 'action-queue',
    argsSchema: noArgsSchema,
    // Action items cut across domains; we show the card to anyone who can see
    // the lobby. Data fetcher filters by what the viewer is allowed to act on.
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Actions',
    description: 'Outstanding tasks assigned to you across deals, proposals, and shows.',
    emptyState: {
      title: 'Inbox zero',
      body: 'Nothing is waiting on you right now.',
    },
    notes: 'No required capability — data fetcher scopes to the viewer.',
  },

  'lobby.todays_brief': {
    id: 'lobby.todays_brief',
    kind: 'widget',
    widgetKey: 'todays-brief',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'daily',
    roles: ['owner', 'pm', 'finance_admin'],
    title: "Today's brief",
    description: 'Aion daily brief with actionable insights. Surfaces follow-ups, crew gaps, and stale deals. Kill-switch aware.',
    emptyState: {
      title: 'No briefing yet',
      body: 'The daily brief generates overnight. Check back tomorrow.',
    },
    notes: 'Spec: docs/reference/sales-dashboard-design.md §5.1',
  },

  'lobby.owed_today': {
    id: 'lobby.owed_today',
    kind: 'widget',
    widgetKey: 'owed-today',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Owed today',
    description: 'Ranked worklist of deals waiting on you. Phone-first — log calls, snooze, dismiss inline.',
    emptyState: {
      title: 'Nothing owed today',
      body: 'Two deals are cooling — glance at Gone Quiet when you have a minute.',
    },
    notes: 'Replaces the post-it stack. Spec: docs/reference/sales-dashboard-design.md §5.2',
  },

  'lobby.this_week': {
    id: 'lobby.this_week',
    kind: 'widget',
    widgetKey: 'this-week',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator', 'employee'],
    title: 'This week',
    description: 'Five-day calendar ribbon. Confirmed shows + tentative date holds from open deals.',
    emptyState: {
      title: 'Nothing on the books this week',
      body: 'Good time to reach out.',
    },
    notes: 'Sales/ops cohabitation card. Spec: docs/reference/sales-dashboard-design.md §5.3',
  },

  'lobby.awaiting_signature': {
    id: 'lobby.awaiting_signature',
    kind: 'widget',
    widgetKey: 'awaiting-signature',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin'],
    title: 'Awaiting signature / deposit',
    description: 'Accepted proposals not yet signed + signed contracts with overdue deposits.',
    emptyState: {
      title: 'All current',
      body: 'All signatures and deposits are current.',
    },
    notes: 'Spec: docs/reference/sales-dashboard-design.md §5.4',
  },

  'lobby.gone_quiet': {
    id: 'lobby.gone_quiet',
    kind: 'widget',
    widgetKey: 'gone-quiet',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Gone quiet',
    description: 'Stalled deals + dormant clients the post-it wall can\'t track. Capped at 5.',
    emptyState: {
      title: 'All active',
      body: "No one's fallen off — you're on top of it.",
    },
    notes: 'Spec: docs/reference/sales-dashboard-design.md §5.5',
  },

  'lobby.weekly_tally': {
    id: 'lobby.weekly_tally',
    kind: 'widget',
    widgetKey: 'weekly-tally',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['deals:read:global'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'This week',
    description: 'Outcome counts: proposals sent, deposits in, follow-ups logged, deals won. Never activity metrics.',
    emptyState: {
      title: 'New week',
      body: 'Activity will tally as the week progresses.',
    },
    notes: 'Cross-off card. Spec: docs/reference/sales-dashboard-design.md §5.6',
  },

  'lobby.activity_feed': {
    id: 'lobby.activity_feed',
    kind: 'widget',
    widgetKey: 'activity-feed',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator'],
    title: 'Recent activity',
    description: 'Workspace-wide event stream — edits, sends, assignments, payments.',
    emptyState: {
      title: 'No activity yet',
      body: 'Activity will populate as you and your team work in Unusonic.',
    },
    notes: 'No required capability — fetcher filters rows to what the viewer can see.',
  },

  'lobby.action_stream': {
    id: 'lobby.action_stream',
    kind: 'widget',
    widgetKey: 'action-stream',
    argsSchema: noArgsSchema,
    // Suggested actions are Aion-driven.
    requiredCapabilities: ['tier:aion:active'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Action stream',
    description: 'Aion-suggested next actions based on what changed in your workspace.',
    emptyState: {
      title: 'No suggestions right now',
      body: 'Aion surfaces suggested actions as deals, shows, and invoices change.',
    },
    notes: 'Aion feature — gated on tier:aion:active.',
  },

  'lobby.event_type_dist': {
    id: 'lobby.event_type_dist',
    kind: 'widget',
    widgetKey: 'event-type-dist',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Event types',
    description: 'Mix of event types in the current window — festival, private, corporate, etc.',
    emptyState: {
      title: 'No events classified yet',
      body: 'Event-type distribution appears once you have tagged shows.',
    },
  },

  // Live production cards ---------------------------------------------------

  'lobby.live_gig_monitor': {
    id: 'lobby.live_gig_monitor',
    kind: 'widget',
    widgetKey: 'live-gig-monitor',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view', 'ros:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Live gig monitor',
    description: 'Countdown and status for the next show — load-in, doors, set times.',
    emptyState: {
      title: 'No upcoming shows',
      body: 'Your next show will appear here once scheduled.',
    },
  },

  'lobby.active_production': {
    id: 'lobby.active_production',
    kind: 'widget',
    widgetKey: 'active-production',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Active production',
    description: 'What is in production right now — crew on call, shows in motion.',
    emptyState: {
      title: 'Nothing in production',
      body: 'When crews are on call or shows are live, they show here.',
    },
  },

  'lobby.real_time_logistics': {
    id: 'lobby.real_time_logistics',
    kind: 'widget',
    widgetKey: 'real-time-logistics',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Real-time logistics',
    description: 'Transport status, crew arrivals, gear moves across today.',
    emptyState: {
      title: 'No logistics events today',
      body: 'Load-ins, transport, and crew check-ins appear here as they happen.',
    },
  },

  'lobby.production_timeline': {
    id: 'lobby.production_timeline',
    kind: 'widget',
    widgetKey: 'production-timeline',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Production timeline',
    description: 'Horizontal timeline across deals and events — milestones, critical dates.',
    emptyState: {
      title: 'Nothing on the timeline',
      body: 'Milestones appear here as you add deals and schedule shows.',
    },
  },

  'lobby.run_of_show': {
    id: 'lobby.run_of_show',
    kind: 'widget',
    widgetKey: 'run-of-show',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['ros:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Run of show',
    description: 'Cue-by-cue production timeline for an individual show.',
    emptyState: {
      title: 'No run of show yet',
      body: 'Create or import cues on the show page to build a run of show.',
    },
    notes: 'Typically embedded in the show page rather than picked standalone; present here for completeness. Employee persona uses run_of_show_feed (live, scoped) instead.',
  },

  'lobby.run_of_show_feed': {
    id: 'lobby.run_of_show_feed',
    kind: 'widget',
    widgetKey: 'run-of-show-feed',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['ros:view'],
    refreshability: 'live',
    roles: ['owner', 'pm', 'touring_coordinator', 'employee'],
    title: 'Run-of-show feed',
    description: 'Live cue feed during a show — what is happening, what is next.',
    emptyState: {
      title: 'No active show',
      body: 'When a show is in live mode, cues stream here.',
    },
  },

  // Workspace / health cards ------------------------------------------------

  'lobby.global_pulse': {
    id: 'lobby.global_pulse',
    kind: 'widget',
    widgetKey: 'global-pulse',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner'],
    title: 'Global pulse',
    description: 'Top-level business health at a glance — pipeline, cash, people, shows.',
    emptyState: {
      title: 'Pulse warming up',
      body: 'Health metrics appear once you have some deals and shows on the books.',
    },
    notes: 'No required capability — composite card; individual metrics gate themselves.',
  },

  'lobby.sentiment_pulse': {
    id: 'lobby.sentiment_pulse',
    kind: 'widget',
    widgetKey: 'sentiment-pulse',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['tier:aion:active'],
    refreshability: 'manual',
    roles: ['owner', 'pm'],
    title: 'Sentiment pulse',
    description: 'Aion-summarized signal across client comms, proposals, and show debriefs.',
    emptyState: {
      title: 'Sentiment is still building',
      body: 'Aion needs a few proposals and show debriefs before it can read signal.',
    },
    notes: 'Aion feature — gated on tier:aion:active.',
  },

  // Network / directory cards -----------------------------------------------

  'lobby.network': {
    id: 'lobby.network',
    kind: 'widget',
    widgetKey: 'network',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Network',
    description: 'People, venues, and companies in your directory. The relationship graph.',
    emptyState: {
      title: 'Network is empty',
      body: 'Add a contact or summon a ghost to start building your network.',
    },
    notes: 'No required capability — reads directory.entities scoped to workspace.',
  },

  'lobby.network_detail': {
    id: 'lobby.network_detail',
    kind: 'widget',
    widgetKey: 'network-detail',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Network detail',
    description: 'Deep-dive sheet for a single person or organization — trade ledger, notes, roster.',
    emptyState: {
      title: 'Pick a contact',
      body: 'Select someone from your network to open their dossier.',
    },
    notes: 'Sheet surface, not a standalone lobby card. Present so Aion can reference it.',
  },

  'lobby.network_stream': {
    id: 'lobby.network_stream',
    kind: 'widget',
    widgetKey: 'network-stream',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Network stream',
    description: 'Membrane-style stream of directory activity — new contacts, recent touches.',
    emptyState: {
      title: 'No network activity yet',
      body: 'As contacts are added and touched, the stream fills in.',
    },
    notes: 'Layout surface for the network page, not a lobby card.',
  },

  'lobby.org_dashboard': {
    id: 'lobby.org_dashboard',
    kind: 'widget',
    widgetKey: 'org-dashboard',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['workspace:team:manage'],
    refreshability: 'manual',
    roles: ['owner'],
    title: 'Organization settings',
    description: 'Workspace-level org profile — name, logo, defaults.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Settings sheet, not a pickable lobby card. Exposed to the library so role-default resolver can show it to owners only.',
  },

  // Onboarding / nudge cards ------------------------------------------------

  'lobby.onboarding': {
    id: 'lobby.onboarding',
    kind: 'widget',
    widgetKey: 'onboarding',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Claim wizard',
    description: 'Guided flow for a new user claiming a ghost or completing onboarding.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Claim flow at /claim/[token]; not a lobby card. Catalogued for completeness.',
  },

  'lobby.passkey_nudge_banner': {
    id: 'lobby.passkey_nudge_banner',
    kind: 'widget',
    widgetKey: 'passkey-nudge-banner',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Passkey nudge',
    description: 'Banner prompting the viewer to add a passkey if none is enrolled.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Global layout banner, not picker-selectable. Registered so the library is exhaustive.',
  },

  'lobby.recovery_backup_prompt': {
    id: 'lobby.recovery_backup_prompt',
    kind: 'widget',
    widgetKey: 'recovery-backup-prompt',
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Recovery backup',
    description: 'Prompt to back up the sovereign-recovery phrase + Shamir shards.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Security nudge banner, not a pickable card. Registered for completeness.',
  },

  // Dev / design surfaces ---------------------------------------------------

  'lobby.design_showcase': {
    id: 'lobby.design_showcase',
    kind: 'widget',
    widgetKey: 'design-showcase',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['workspace:owner'],
    refreshability: 'manual',
    roles: ['owner'],
    title: 'Identity lab',
    description: 'Internal design-system showcase. Not exposed to end users.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Dev-only surface. Gated to owners; will likely be removed from the library in a later phase.',
  },

  // Pinned answers (Phase 3.2) ----------------------------------------------

  'lobby.pinned_answers': {
    id: 'lobby.pinned_answers',
    kind: 'widget',
    widgetKey: 'pinned-answers',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: [],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'finance_admin', 'touring_coordinator', 'employee'],
    title: 'Your pins',
    description: 'Answers you pinned from Aion. Refresh on cadence; click to re-open in Aion.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Rendered by the Lobby when the user has ≥1 pin. Not library-pickable; the page gates the section directly on pin count + feature flag.',
  },

  // Phase 5.1 — touring coordinator table-backed widgets --------------------
  // The scalar pairs (ops.crew_utilization, finance.revenue_yoy) live in the
  // RPC metric entries the parallel Phase 4.2+5.4 agent adds — they don't
  // need a separate widget entry. These three ride the underlying
  // ops.settlement_variance / ops.vendor_payment_status / ops.multi_stop_rollup
  // table metrics but surface as dedicated Lobby cards with tour-coordinator
  // empty-state copy per the role-default spec's catalog-gap notes.

  'lobby.settlement_tracking': {
    id: 'lobby.settlement_tracking',
    kind: 'widget',
    widgetKey: 'settlement-tracking',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['touring_coordinator', 'owner'],
    title: 'Settlement tracking',
    description:
      'Largest variance between expected and actual settlement per show on the active tour.',
    emptyState: {
      title: 'No settlements to track',
      body: 'Settlement variance appears here once tour shows have received payments.',
    },
    notes:
      'Reads the ops.settlement_variance table metric and clips to the top 3 rows by absolute variance.',
  },

  'lobby.vendor_payment_status': {
    id: 'lobby.vendor_payment_status',
    kind: 'widget',
    widgetKey: 'vendor-payment-status',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
    refreshability: 'manual',
    roles: ['touring_coordinator', 'owner'],
    title: 'Vendor payments',
    description:
      'Top vendors with outstanding balances on the active tour, with overdue counts.',
    emptyState: {
      title: 'All vendors paid up',
      body: 'No outstanding vendor balances on the active tour.',
    },
    notes:
      'Reads the ops.vendor_payment_status table metric and clips to the top 3 rows by outstanding amount.',
  },

  'lobby.multi_stop_rollup': {
    id: 'lobby.multi_stop_rollup',
    kind: 'widget',
    widgetKey: 'multi-stop-rollup',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['touring_coordinator', 'owner'],
    title: 'Tour rollup',
    description:
      'Next 3–5 markets on the active tour with advance/load-in status per stop.',
    emptyState: {
      title: 'Not on tour',
      body: 'When a tour is active, upcoming markets and their status appear here.',
    },
    notes:
      'Reads the ops.multi_stop_rollup table metric; falls back to a stub shape (event_id, event_title, event_date, status) if the richer city column is not yet wired.',
  },

  // Event command-grid ------------------------------------------------------

  'lobby.event_dashboard': {
    id: 'lobby.event_dashboard',
    kind: 'widget',
    widgetKey: 'event-dashboard',
    pickable: false,
    argsSchema: noArgsSchema,
    requiredCapabilities: ['planning:view'],
    refreshability: 'manual',
    roles: ['owner', 'pm', 'touring_coordinator'],
    title: 'Event command',
    description: 'Full-page command grid for a single event — logistics, crew, financials.',
    emptyState: {
      title: '',
      body: '',
    },
    notes: 'Event page grid, not a lobby card. Registered so Aion/library can reference it.',
  },
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

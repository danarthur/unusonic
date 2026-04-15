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

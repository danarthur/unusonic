/**
 * Table metrics — row-set metric definitions (reconciliation tables, worksheets).
 *
 * Extracted from registry.ts (Phase 0.5-style split, 2026-04-29).
 *
 * Spread into the canonical METRICS map by registry.ts.
 */

import { z } from 'zod';
import type { MetricDefinition } from '../types';
import { periodSchema, noArgsSchema, yearSchema } from './schemas';

export const TABLE_METRICS: Record<string, MetricDefinition> = {
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
};

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
    argsSchema: noArgsSchema,
    unit: 'count',
    comparisonSentiment: 'negative',
    hasSparkline: false,
    requiredCapabilities: ['finance:view'],
    refreshability: 'hourly',
    roles: ['finance_admin'],
    title: 'QBO sync issues',
    description: 'Invoices that failed to sync to QuickBooks Online or are stuck in an unsynced state.',
    emptyState: {
      title: 'All synced',
      body: 'Every invoice is up to date with QuickBooks.',
    },
    notes: 'Excludes draft and void invoices. Phase 1.3 will tighten to require finance:reconcile capability.',
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
    requiredCapabilities: ['finance:view'],
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

  // ── Table metrics ──────────────────────────────────────────────────────────

  'finance.unreconciled_payments': {
    id: 'finance.unreconciled_payments',
    kind: 'table',
    rpcSchema: 'finance',
    rpcName: 'metric_unreconciled_payments',
    argsSchema: noArgsSchema,
    requiredCapabilities: ['finance:view'],
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
    requiredCapabilities: ['finance:view'],
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
    requiredCapabilities: ['finance:view'],
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
    requiredCapabilities: ['finance:view'],
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
};

/** All metric IDs as a const array — useful for tests and library filtering. */
export const METRIC_IDS = Object.keys(METRICS) as Array<keyof typeof METRICS>;

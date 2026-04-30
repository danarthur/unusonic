/**
 * Scalar metrics — single-value metric definitions (currency / count / percent).
 *
 * Extracted from registry.ts (Phase 0.5-style split, 2026-04-29).
 *
 * Spread into the canonical METRICS map by registry.ts. Add new scalar
 * metrics here, not in the main registry.
 */

import type { MetricDefinition } from '../types';
import { periodSchema, noArgsSchema, daysWindowSchema } from './schemas';

export const SCALAR_METRICS: Record<string, MetricDefinition> = {
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
};

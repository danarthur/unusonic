/**
 * Metric registry types — locked Phase 1.2a.
 *
 * Two kinds: 'scalar' (one number + optional comparison/sparkline, fits the
 * Aion analytics_result card) and 'table' (rows for the Reconciliation surface).
 *
 * The shape includes Phase 2.1+ fields (widgetKey, requiredCapabilities, roles,
 * refreshability, emptyState) by design — locking the full shape now prevents
 * the registry rewrite when Phase 2.1 starts. Per implementation-plan v1.1 §1.2b.
 *
 * @module shared/lib/metrics/types
 */

import type { z } from 'zod';
import type { CapabilityKey } from '@/shared/lib/permission-registry';

/**
 * Capability keys the metric requires the caller to hold. Aliased to the
 * project-wide CapabilityKey union so the registry is automatically constrained
 * to real capabilities. New capability strings (e.g. 'finance:reconcile' for
 * Phase 1.3) get added to permission-registry.ts and are immediately usable here.
 */
export type MetricCapability = CapabilityKey;

/** Drives presentation in the analytics_result card and the Reconciliation table. */
export type MetricUnit = 'currency' | 'count' | 'percent' | 'duration' | 'timestamp' | 'ratio';

/** Pin refresh cadence — only meaningful for kind='scalar'. */
export type MetricRefreshCadence = 'live' | 'hourly' | 'daily' | 'manual';

/** Which role-default sets include this metric (Phase 2.2 use). */
export type MetricRole = 'owner' | 'pm' | 'finance_admin' | 'touring_coordinator' | 'employee';

/**
 * Business-meaning sentiment for the comparison delta.
 * 'positive': up = good (revenue going up).
 * 'negative': up = bad (overdue going up).
 * 'neutral': direction is informational only.
 *
 * Set per metric here, NOT inferred at render time. The data-viz system is
 * explicit: "Up is not always good."
 */
export type MetricSentiment = 'positive' | 'negative' | 'neutral';

export type MetricEmptyState = {
  title: string;
  body: string;
  cta?: { label: string; href: string };
};

/** Schemas the RPC may live in. Public is allowed for grandfathered metric reads. */
export type MetricRpcSchema = 'finance' | 'ops' | 'cortex' | 'directory' | 'public';

/** Common fields across all kinds. */
type MetricBase = {
  /** Stable, namespaced ID. e.g. 'finance.revenue_collected'. Pin storage uses this verbatim. */
  id: string;
  argsSchema: z.ZodTypeAny;
  /** Defaults applied at the call site if the caller omits an optional arg. */
  defaultArgs?: Record<string, unknown>;
  requiredCapabilities: MetricCapability[];
  refreshability: MetricRefreshCadence;
  roles: MetricRole[];
  title: string;
  description: string;
  emptyState: MetricEmptyState;
  /** Free-form notes, especially when the RPC reads grandfathered tables. */
  notes?: string;
};

/** RPC-backed metric base: adds RPC name/schema plus an optional widget render hint. */
type RpcMetricBase = MetricBase & {
  rpcName: string;
  rpcSchema: MetricRpcSchema;
  /** Phase 2.1 hint: the widget folder under src/widgets/ this metric optionally renders as. */
  widgetKey?: string;
};

/** Aion-friendly scalar metric — one hero number, optional comparison and sparkline. */
export type ScalarMetricDefinition = RpcMetricBase & {
  kind: 'scalar';
  unit: MetricUnit;
  /** Set even if comparison isn't always returned — the registry owns sentiment. */
  comparisonSentiment: MetricSentiment;
  /** Whether the RPC returns a sparkline_values numeric[]. Drives renderer hint. */
  hasSparkline: boolean;
};

/** Tabular metric for Reconciliation surface or any list view. */
export type TableMetricDefinition = RpcMetricBase & {
  kind: 'table';
  /** Column rendering hints. Keys MUST match the RPC's return column names. */
  columns: Array<{
    key: string;
    label: string;
    align?: 'left' | 'right';
    format?: 'currency' | 'date' | 'percent' | 'count' | 'text';
  }>;
  /** Whether the surface should offer CSV export of the result rows. */
  exportable: boolean;
};

/**
 * Widget-kind metric — catalogs an existing lobby bento card (or other standalone
 * widget) for the Phase 2.3 "swap from library" UX. Unlike scalar/table metrics,
 * widgets carry their own data fetch and render; callMetric() does not resolve
 * them. The registry entry exists so the library-filter pipeline
 * (capability + role) can reason about the card before it renders.
 *
 * `widgetKey` is required and MUST match the folder under `src/widgets/` as well
 * as the `widgetKey` const exported by that folder.
 */
export type WidgetMetricDefinition = MetricBase & {
  kind: 'widget';
  widgetKey: string;
};

export type MetricDefinition =
  | ScalarMetricDefinition
  | TableMetricDefinition
  | WidgetMetricDefinition;

/** Type guards. */
export function isScalarMetric(m: MetricDefinition): m is ScalarMetricDefinition {
  return m.kind === 'scalar';
}

export function isTableMetric(m: MetricDefinition): m is TableMetricDefinition {
  return m.kind === 'table';
}

export function isWidgetMetric(m: MetricDefinition): m is WidgetMetricDefinition {
  return m.kind === 'widget';
}

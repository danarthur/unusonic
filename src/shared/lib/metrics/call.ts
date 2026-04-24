/**
 * callMetric — the single chokepoint between metric RPCs and the rest of the app.
 *
 * Resolves a registry entry by id, validates user-facing args via the entry's
 * Zod schema, calls the underlying SECURITY DEFINER RPC, and shapes the result
 * to match the analytics_result wire format (for scalar) or returns rows
 * directly (for table). Number formatting per registry.unit lives here so the
 * renderer never re-formats and finance numbers always agree across surfaces.
 *
 * @module shared/lib/metrics/call
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/shared/api/supabase/server';
import { METRICS } from './registry';
import type {
  MetricDefinition,
  ScalarMetricDefinition,
  TableMetricDefinition,
  MetricUnit,
} from './types';
import { isScalarMetric, isWidgetMetric } from './types';

// ─── Result shapes ───────────────────────────────────────────────────────────

export type ScalarMetricValue = {
  /** Raw number from the RPC. callers use this for math; renderer uses primaryFormatted. */
  primary: number;
  /** Pre-formatted string per registry.unit. The renderer drops this in unchanged. */
  primaryFormatted: string;
  unit: MetricUnit;
  /** Pre-formatted secondary line, when present. */
  secondary?: string;
};

export type ScalarMetricComparison = {
  /** Raw prior-period value. */
  value: number;
  /** Pre-formatted delta string with sign, e.g. '+$2,400'. */
  delta: string;
  direction: 'up' | 'down' | 'flat';
  /** Sentiment piped through from the registry (positive/negative/neutral). */
  sentiment: 'positive' | 'negative' | 'neutral';
  /** Human label, e.g. 'vs prior 30 days'. */
  label: string;
};

export type ScalarMetricResult = {
  ok: true;
  kind: 'scalar';
  metricId: string;
  args: Record<string, unknown>;
  value: ScalarMetricValue;
  comparison?: ScalarMetricComparison;
  /** Raw sparkline series (oldest → newest). Renderer drops it if length < 7. */
  sparkline?: number[];
  computedAt: string;
};

export type TableMetricResult = {
  ok: true;
  kind: 'table';
  metricId: string;
  args: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
  computedAt: string;
};

export type MetricErrorResult = {
  ok: false;
  metricId: string;
  args: Record<string, unknown>;
  error: string;
  /** When set, callers can render a "fix this" link. */
  recoveryUrl?: string;
};

export type MetricResult = ScalarMetricResult | TableMetricResult | MetricErrorResult;

// ─── Number formatting ───────────────────────────────────────────────────────

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const COMPACT_USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const PCT = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });

function formatPrimary(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'currency':
      return Math.abs(value) >= 10_000 ? COMPACT_USD.format(value) : USD.format(value);
    case 'count':
      return Math.abs(value) >= 10_000 ? COMPACT.format(value) : value.toLocaleString('en-US');
    case 'percent':
      return PCT.format(value);
    case 'ratio':
      return value.toFixed(2);
    case 'duration':
    case 'timestamp':
      return String(value);
  }
}

/** Signed delta string: '+$2,400', '-12', '+1.2K'. */
function formatDelta(curr: number, prior: number, unit: MetricUnit): string {
  const diff = curr - prior;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  const absStr = formatPrimary(Math.abs(diff), unit);
  return diff === 0 ? formatPrimary(0, unit) : `${sign}${absStr}`;
}

function direction(curr: number, prior: number): ScalarMetricComparison['direction'] {
  if (curr > prior) return 'up';
  if (curr < prior) return 'down';
  return 'flat';
}

// ─── RPC argument naming convention ──────────────────────────────────────────

/**
 * Prefixes user-facing arg keys with 'p_' to match the SQL parameter names.
 * workspace_id is added automatically from the call's workspaceId argument.
 */
function buildRpcArgs(workspaceId: string, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { p_workspace_id: workspaceId };
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined) out[`p_${k}`] = v;
  }
  return out;
}

// ─── The chokepoint ──────────────────────────────────────────────────────────

export type CallMetricOptions = {
  /**
   * Inject a Supabase client. Defaults to the standard server client (RLS-bound).
   * The Phase 3.3 pin-refresh cron passes a system client to bypass RLS
   * (workspace check still enforced inside the RPC for non-system callers).
   */
  client?: SupabaseClient;
};

export async function callMetric(
  workspaceId: string,
  metricId: string,
  rawArgs: Record<string, unknown> = {},
  opts: CallMetricOptions = {},
): Promise<MetricResult> {
  const definition = METRICS[metricId];
  if (!definition) {
    return {
      ok: false,
      metricId,
      args: rawArgs,
      error: `Unknown metric '${metricId}'`,
    };
  }

  // Widget-kind entries are render hints for the Phase 2.3 library picker,
  // not RPC-backed metrics. callMetric refuses them so an Aion/pin flow that
  // hands us 'lobby.*' never silently hits a non-existent RPC.
  if (isWidgetMetric(definition)) {
    return {
      ok: false,
      metricId,
      args: rawArgs,
      error: `Metric '${metricId}' is a widget entry and cannot be invoked via callMetric`,
    };
  }

  // Validate user-facing args.
  const parse = definition.argsSchema.safeParse({ ...definition.defaultArgs, ...rawArgs });
  if (!parse.success) {
    return {
      ok: false,
      metricId,
      args: rawArgs,
      error: `Invalid args: ${parse.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`,
    };
  }
  const validatedArgs = parse.data as Record<string, unknown>;

  const client = opts.client ?? (await createClient());
  const rpcArgs = buildRpcArgs(workspaceId, validatedArgs);

  // RPCs in non-public schemas need .schema(...). Cast to any because the
  // generated supabase types only cover public; the finance schema is reached
  // via the runtime escape hatch (tracked as PR-INFRA-2 in CLAUDE.md).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await client
    .schema(definition.rpcSchema)
    .rpc(definition.rpcName, rpcArgs);

  if (error) {
    return {
      ok: false,
      metricId,
      args: validatedArgs,
      error: error.message,
    };
  }

  const computedAt = new Date().toISOString();

  if (isScalarMetric(definition)) {
    return shapeScalarResult(definition, validatedArgs, data, computedAt);
  }
  return shapeTableResult(definition, validatedArgs, data, computedAt);
}

// ─── Scalar shaping ──────────────────────────────────────────────────────────

type ScalarRpcRow = {
  primary_value: number | string | null;
  secondary_text: string | null;
  comparison_value: number | string | null;
  comparison_label: string | null;
  sparkline_values: number[] | null;
};

function shapeScalarResult(
  def: ScalarMetricDefinition,
  args: Record<string, unknown>,
  data: unknown,
  computedAt: string,
): ScalarMetricResult {
  const rows = (data ?? []) as ScalarRpcRow[];
  const row: ScalarRpcRow = rows[0] ?? {
    primary_value: 0,
    secondary_text: null,
    comparison_value: null,
    comparison_label: null,
    sparkline_values: null,
  };

  const primary = Number(row.primary_value ?? 0);
  const value: ScalarMetricValue = {
    primary,
    primaryFormatted: formatPrimary(primary, def.unit),
    unit: def.unit,
    secondary: row.secondary_text ?? undefined,
  };

  let comparison: ScalarMetricComparison | undefined;
  if (row.comparison_value !== null && row.comparison_label) {
    const prior = Number(row.comparison_value);
    comparison = {
      value: prior,
      delta: formatDelta(primary, prior, def.unit),
      direction: direction(primary, prior),
      sentiment: def.comparisonSentiment,
      label: row.comparison_label,
    };
  }

  const sparkline = row.sparkline_values && row.sparkline_values.length > 0
    ? row.sparkline_values.map(Number)
    : undefined;

  return {
    ok: true,
    kind: 'scalar',
    metricId: def.id,
    args,
    value,
    comparison,
    sparkline,
    computedAt,
  };
}

// ─── Table shaping ───────────────────────────────────────────────────────────

function shapeTableResult(
  def: TableMetricDefinition,
  args: Record<string, unknown>,
  data: unknown,
  computedAt: string,
): TableMetricResult {
  const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];
  return {
    ok: true,
    kind: 'table',
    metricId: def.id,
    args,
    rows,
    computedAt,
  };
}

// ─── Helpers for callers ─────────────────────────────────────────────────────

export function getMetricDefinition(metricId: string): MetricDefinition | undefined {
  return METRICS[metricId];
}

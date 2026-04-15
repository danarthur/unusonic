/**
 * Analytics tools — Phase 3.1.
 *
 * Exposes `call_metric`, the single chokepoint Aion uses to invoke a registered
 * scalar or table metric. The tool delegates to `callMetric` in
 * `src/shared/lib/metrics/call.ts` and shapes the result into an
 * `analytics_result` content block (scalar) or falls back to `data_table`
 * (table).
 *
 * Wire format locked in docs/reference/pages/reports-analytics-result-design.md §1.
 *
 * @module app/api/aion/chat/tools/analytics
 */

import { tool } from 'ai';
import { z } from 'zod';
import { callMetric, getMetricDefinition } from '@/shared/lib/metrics/call';
import { METRICS, getRelatedMetricChips } from '@/shared/lib/metrics/registry';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';
import {
  isScalarMetric,
  isTableMetric,
  type ScalarMetricDefinition,
} from '@/shared/lib/metrics/types';
import {
  FEATURE_FLAGS,
  isFeatureEnabled,
} from '@/shared/lib/feature-flags';
import type {
  AnalyticsResult,
  AnalyticsResultPill,
  DataTableColumn,
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import type { AionToolContext } from './types';

// ─── Pill derivation ────────────────────────────────────────────────────────

type ChoiceSetKey = NonNullable<AnalyticsResultPill['choiceSetKey']>;

/** Resolve an arg key to the Phase 3.1 choice-set, or undefined when unsupported. */
function choiceSetFor(argKey: string): ChoiceSetKey | undefined {
  if (argKey === 'period_start' || argKey === 'period_end' || argKey === 'period') return 'period';
  if (argKey === 'year') return 'year';
  if (argKey === 'client_id') return 'client';
  if (argKey === 'crew_member' || argKey === 'entity_id') return 'crew_member';
  if (argKey === 'event_id') return 'event';
  if (argKey === 'tag') return 'tag';
  return undefined;
}

/** Human-readable pill label for a given arg. */
function pillLabelFor(argKey: string, value: unknown): string {
  if (argKey === 'year') return String(value ?? '');
  if (argKey === 'tz') return `tz: ${String(value)}`;
  if (argKey === 'compare') return value ? 'Compare' : 'No compare';
  return String(value ?? '');
}

/**
 * Build the pills array from the finalized args.
 *
 * Collapses `period_start` + `period_end` into a single period pill when both
 * are present, since the choice-set dropdown emits them as a compound edit.
 */
function buildPills(args: Record<string, unknown>): AnalyticsResultPill[] {
  const pills: AnalyticsResultPill[] = [];
  const seen = new Set<string>();

  // Collapsed period pill.
  if ('period_start' in args && 'period_end' in args) {
    pills.push({
      key: 'period',
      label: `${String(args.period_start)} → ${String(args.period_end)}`,
      value: { period_start: args.period_start, period_end: args.period_end },
      editable: true,
      choiceSetKey: 'period',
    });
    seen.add('period_start');
    seen.add('period_end');
  }

  for (const [argKey, value] of Object.entries(args)) {
    if (seen.has(argKey)) continue;
    if (value === undefined || value === null) continue;
    // Internal/noise args — keep them out of the pill row.
    if (argKey === 'compare' || argKey === 'tz') continue;

    const choiceSetKey = choiceSetFor(argKey);
    const supported = choiceSetKey === 'period' || choiceSetKey === 'year';
    pills.push({
      key: argKey,
      label: pillLabelFor(argKey, value),
      value,
      editable: supported, // disabled-editable pills still render with a tooltip
      choiceSetKey,
    });
    seen.add(argKey);
  }

  return pills;
}

// ─── Scalar → analytics_result shaping ──────────────────────────────────────

function toAnalyticsResult(
  def: ScalarMetricDefinition,
  result: Awaited<ReturnType<typeof callMetric>>,
  pinEnabled: boolean,
  followUps: Array<{ label: string; value: string; metricId: string }>,
): AnalyticsResult | null {
  if (!('ok' in result) || !result.ok || result.kind !== 'scalar') return null;

  const pills = buildPills(result.args);
  const hasValue = Number.isFinite(result.value.primary) && result.value.primary !== 0;
  const empty =
    !hasValue && result.value.primary === 0
      ? { title: def.emptyState.title, body: def.emptyState.body, cta: def.emptyState.cta }
      : undefined;

  return {
    type: 'analytics_result',
    text: '',
    metricId: def.id,
    title: def.title,
    args: result.args,
    value: {
      primary: result.value.primaryFormatted,
      unit: result.value.unit,
      secondary: result.value.secondary,
    },
    comparison: result.comparison
      ? {
          label: result.comparison.label,
          delta: result.comparison.delta,
          direction: result.comparison.direction,
          sentiment: result.comparison.sentiment,
        }
      : undefined,
    sparkline: result.sparkline,
    pills,
    pinnable: true,
    pinEnabled,
    freshness: {
      computedAt: result.computedAt,
      cadence: def.refreshability,
    },
    ...(empty ? { empty } : {}),
    ...(followUps.length > 0
      ? { followUps: followUps.map((c) => ({ label: c.label, value: c.value })) }
      : {}),
  };
}

// ─── Table → data_table fallback ────────────────────────────────────────────

function toDataTable(
  def: ReturnType<typeof getMetricDefinition>,
  result: Awaited<ReturnType<typeof callMetric>>,
): { type: 'data_table'; title: string; columns: DataTableColumn[]; rows: Record<string, string | number>[]; text: string } | null {
  if (!def || !isTableMetric(def)) return null;
  if (!('ok' in result) || !result.ok || result.kind !== 'table') return null;
  const columns: DataTableColumn[] = def.columns.map((c) => ({
    key: c.key,
    label: c.label,
    align: c.align,
  }));
  const rows: Record<string, string | number>[] = result.rows.map((row) => {
    const out: Record<string, string | number> = {};
    for (const c of def.columns) {
      const v = (row as Record<string, unknown>)[c.key];
      if (v === null || v === undefined) {
        out[c.key] = '';
      } else if (typeof v === 'number') {
        out[c.key] = v;
      } else {
        out[c.key] = String(v);
      }
    }
    return out;
  });
  return {
    type: 'data_table',
    title: def.title,
    text: '',
    columns,
    rows,
  };
}

// ─── Public: pure shaping helpers (exposed for tests + route.ts) ────────────

export async function invokeCallMetric(
  workspaceId: string,
  metricId: string,
  args: Record<string, unknown>,
): Promise<
  | { kind: 'analytics_result'; block: AnalyticsResult }
  | { kind: 'data_table'; block: ReturnType<typeof toDataTable> }
  | { kind: 'error'; message: string }
> {
  const def = getMetricDefinition(metricId);
  if (!def) {
    return { kind: 'error', message: `Unknown metric '${metricId}'.` };
  }

  const result = await callMetric(workspaceId, metricId, args);

  if (!result.ok) {
    return { kind: 'error', message: result.error };
  }

  if (isScalarMetric(def) && result.kind === 'scalar') {
    // Resolve the pin feature flag once per invocation. Client reads this to
    // decide whether to show the Pin button; savePin re-checks server-side.
    let pinEnabled = false;
    try {
      pinEnabled = await isFeatureEnabled(workspaceId, FEATURE_FLAGS.REPORTS_AION_PIN);
    } catch {
      pinEnabled = false;
    }
    // Phase 4.3 — resolve follow-ups, filtering to what the viewer can actually
    // call. Silent drop if capabilities resolution fails — follow-ups are
    // optional affordance, not a load-bearing part of the answer.
    let followUps: Array<{ label: string; value: string; metricId: string }> = [];
    try {
      const caps = await userCapabilities(workspaceId);
      followUps = getRelatedMetricChips(def.id, caps as Set<string>);
    } catch {
      followUps = [];
    }
    const block = toAnalyticsResult(def, result, pinEnabled, followUps);
    if (!block) return { kind: 'error', message: 'Failed to shape scalar result.' };
    return { kind: 'analytics_result', block };
  }

  if (isTableMetric(def) && result.kind === 'table') {
    const block = toDataTable(def, result);
    if (!block) return { kind: 'error', message: 'Failed to shape table result.' };
    return { kind: 'data_table', block };
  }

  return { kind: 'error', message: `Metric '${metricId}' has an unsupported kind.` };
}

// ─── Tool factory ───────────────────────────────────────────────────────────

const scalarMetricIds = () =>
  Object.values(METRICS)
    .filter(isScalarMetric)
    .map((m) => m.id);

const tableMetricIds = () =>
  Object.values(METRICS)
    .filter(isTableMetric)
    .map((m) => m.id);

export function createAnalyticsTools(ctx: AionToolContext) {
  const call_metric = tool({
    description:
      'Invoke a registered metric by its ID and return a structured analytics result. ' +
      'Use this when the user asks for a scalar business metric (revenue, AR, variance count, QBO sync health) ' +
      'or a table metric (unreconciled payments, invoice variance, sales tax worksheet, 1099 worksheet). ' +
      `Scalar metric IDs: ${scalarMetricIds().join(', ')}. ` +
      `Table metric IDs: ${tableMetricIds().join(', ')}.`,
    inputSchema: z.object({
      metric_id: z
        .string()
        .describe('The registry ID of the metric to invoke (e.g. finance.revenue_collected).'),
      args: z
        .record(z.string(), z.unknown())
        .optional()
        .describe(
          'User-facing args for the metric, validated against the registry entry\'s argsSchema. ' +
            'Period metrics require period_start + period_end (YYYY-MM-DD). ' +
            'Year metrics require year (integer).',
        ),
    }),
    execute: async (params) => {
      const result = await invokeCallMetric(ctx.workspaceId, params.metric_id, params.args ?? {});
      if (result.kind === 'error') {
        return { error: result.message };
      }
      if (result.kind === 'analytics_result') {
        return { analytics_result: result.block };
      }
      return { data_table: result.block };
    },
  });

  return { call_metric };
}

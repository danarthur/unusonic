/**
 * Server-side fetcher for the admin telemetry dashboard. Pulled out of
 * page.tsx so the page itself stays under the eslint complexity cap and
 * the metric-mapping logic has one home.
 *
 * Service-role client bypasses RLS — that's fine for the admin dashboard
 * because the page-level isAionAdmin gate already authorized the caller.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import type {
  DismissRateRow,
  HitRateRow,
  KillMetricRow,
  ToolDepthRow,
  ClickThroughRow,
  CostPerSeatRow,
} from './types';

export type AdminMetricsResult = {
  dismissRate: DismissRateRow[];
  hitRate: HitRateRow[];
  toolDepth: ToolDepthRow | null;
  clickThrough: ClickThroughRow | null;
  killMetric: KillMetricRow[];
  costPerSeat: CostPerSeatRow[];
  errors: {
    dismiss: string | null;
    hit: string | null;
    tool: string | null;
    click: string | null;
    kill: string | null;
    cost: string | null;
  };
};

type RpcResult<T> = { data: T | null; error: { message: string } | null };

function rowsOrEmpty<T>(res: RpcResult<T[]>): T[] {
  return res.data ?? [];
}

function firstRowOrNull<T>(res: RpcResult<T[]>): T | null {
  return res.data?.[0] ?? null;
}

function errorMessage(res: { error: { message: string } | null }): string | null {
  return res.error?.message ?? null;
}

export async function fetchAdminMetrics(): Promise<AdminMetricsResult> {
  const system = getSystemClient();
  const aion = system.schema('aion');

  const [dismissRes, hitRes, toolRes, clickRes, killRes, costRes] = await Promise.all([
    aion.rpc('metric_dismiss_rate',          { p_window_days: 30, p_min_sample: 20 }),
    aion.rpc('metric_hit_rate',              { p_window_days: 30, p_min_sample: 20 }),
    aion.rpc('metric_tool_depth',            { p_window_days: 7 }),
    aion.rpc('metric_pill_click_through',    { p_window_days: 7 }),
    aion.rpc('metric_brief_open_kill_check', {
      p_window_days: 90,
      p_repeat_window_days: 7,
      p_min_repeats: 2,
    }),
    aion.rpc('metric_cost_per_seat',         { p_window_days: 30 }),
  ]);

  return {
    dismissRate:  rowsOrEmpty(dismissRes as RpcResult<DismissRateRow[]>),
    hitRate:      rowsOrEmpty(hitRes as RpcResult<HitRateRow[]>),
    toolDepth:    firstRowOrNull(toolRes as RpcResult<ToolDepthRow[]>),
    clickThrough: firstRowOrNull(clickRes as RpcResult<ClickThroughRow[]>),
    killMetric:   rowsOrEmpty(killRes as RpcResult<KillMetricRow[]>),
    costPerSeat:  rowsOrEmpty(costRes as RpcResult<CostPerSeatRow[]>),
    errors: {
      dismiss: errorMessage(dismissRes),
      hit:     errorMessage(hitRes),
      tool:    errorMessage(toolRes),
      click:   errorMessage(clickRes),
      kill:    errorMessage(killRes),
      cost:    errorMessage(costRes),
    },
  };
}

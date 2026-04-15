'use server';

/**
 * Revenue YoY widget — data fetcher.
 *
 * Reads the `finance.revenue_yoy` metric (Phase 5.4). Hero = current-period
 * revenue, comparison = same period last year. Gated on `finance:view`.
 *
 * Defaults the period to the current calendar month; Phase 2.4 threading
 * will replace it with the Lobby's global period.
 *
 * @module widgets/revenue-yoy/api/get-revenue-yoy
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric } from '@/shared/lib/metrics/call';

// ── Types ──────────────────────────────────────────────────────────────────

export type RevenueYoyDTO = {
  /** Pre-formatted currency string for the current period, e.g. "$12.4K". */
  revenueFormatted: string;
  /** Raw cents/dollars value for this period (registry does the unit work). */
  revenueValue: number;
  /** Optional pre-formatted secondary (e.g. registry summary). */
  secondary: string | null;
  /** Pre-formatted YoY delta, e.g. "+$2,400" or "-$5K". Null when unavailable. */
  comparisonDelta: string | null;
  /** Direction — drives arrow + sentiment color. */
  comparisonDirection: 'up' | 'down' | 'flat' | null;
  /** Prior-year label from the RPC, e.g. "vs 2025". */
  comparisonLabel: string | null;
  /** True when the RPC itself failed. */
  errored: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────

function defaultPeriod(): { period_start: string; period_end: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return {
    period_start: `${year}-${month}-01`,
    period_end: `${year}-${month}-${day}`,
  };
}

// ── Fetcher ────────────────────────────────────────────────────────────────

const ERROR_DTO: RevenueYoyDTO = {
  revenueFormatted: '$0',
  revenueValue: 0,
  secondary: null,
  comparisonDelta: null,
  comparisonDirection: null,
  comparisonLabel: null,
  errored: true,
};

/** Pulls the scalar metric result into the DTO shape. Extracted to keep the
 * top-level fetcher inside the Stage-Engineering complexity budget. */
async function fetchRevenueYoyDTO(workspaceId: string): Promise<RevenueYoyDTO> {
  const result = await callMetric(workspaceId, 'finance.revenue_yoy', defaultPeriod());
  if (!result.ok || result.kind !== 'scalar') return ERROR_DTO;

  return {
    revenueFormatted: result.value.primaryFormatted,
    revenueValue: Number(result.value.primary ?? 0),
    secondary: result.value.secondary ?? null,
    comparisonDelta: result.comparison?.delta ?? null,
    comparisonDirection: result.comparison?.direction ?? null,
    comparisonLabel: result.comparison?.label ?? null,
    errored: false,
  };
}

export async function getRevenueYoy(): Promise<RevenueYoyDTO | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const allowed = await hasCapability(user.id, workspaceId, 'finance:view');
  if (!allowed) return null;

  return fetchRevenueYoyDTO(workspaceId);
}

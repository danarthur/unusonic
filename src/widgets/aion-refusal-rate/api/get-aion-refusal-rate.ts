'use server';

/**
 * Aion refusal-rate widget — data fetcher.
 *
 * Reads the `ops.aion_refusal_rate` metric via the metric-registry chokepoint
 * (`callMetric`). Gated on `workspace:owner` (owner-only per Phase 3.4 plan);
 * non-owners get a `null` DTO and never pay the query cost.
 *
 * @module widgets/aion-refusal-rate/api/get-aion-refusal-rate
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric } from '@/shared/lib/metrics/call';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * DTO shaped for the Lobby card. The registry formats `primary_value` as a
 * percent string via callMetric; we pass both the formatted string (for
 * display) and the raw 0..1 fraction (for threshold-based styling).
 */
export type AionRefusalRateDTO = {
  /** Pre-formatted percent string, e.g. "12.4%" (registry unit='percent'). */
  rateFormatted: string;
  /** Raw fraction 0..1. Used to drive the 10% threshold color. */
  rateFraction: number;
  /** Raw counts line, e.g. "3 of 25 turns refused" or the no-activity copy. */
  secondary: string | null;
  /** Prior-window delta (pre-formatted) when available. */
  comparisonDelta: string | null;
  /** Direction for the trend arrow — registry sentiment is negative (up = bad). */
  comparisonDirection: 'up' | 'down' | 'flat' | null;
  /** True when the RPC itself failed. */
  errored: boolean;
};

// ── Fetcher ────────────────────────────────────────────────────────────────

export async function getAionRefusalRate(): Promise<AionRefusalRateDTO | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Owner-only. Hide from non-owners — refusal rate is an ops-quality signal
  // meant for the workspace owner, not every member.
  const allowed = await hasCapability(user.id, workspaceId, 'workspace:owner');
  if (!allowed) return null;

  const result = await callMetric(workspaceId, 'ops.aion_refusal_rate');

  if (!result.ok || result.kind !== 'scalar') {
    return {
      rateFormatted: '0%',
      rateFraction: 0,
      secondary: null,
      comparisonDelta: null,
      comparisonDirection: null,
      errored: true,
    };
  }

  return {
    rateFormatted: result.value.primaryFormatted,
    rateFraction: Number(result.value.primary ?? 0),
    secondary: result.value.secondary ?? null,
    comparisonDelta: result.comparison?.delta ?? null,
    comparisonDirection: result.comparison?.direction ?? null,
    errored: false,
  };
}

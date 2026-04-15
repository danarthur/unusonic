'use server';

/**
 * Crew utilization widget — data fetcher.
 *
 * Reads the `ops.crew_utilization` metric (Phase 5.4) via the registry
 * chokepoint. Gated on the `planning:view` capability; non-qualifying users
 * get a `null` DTO and never pay the query cost.
 *
 * Defaults the period to the current calendar month (YYYY-MM-01 → today).
 * Phase 2.4 context threading will replace the default with the Lobby's
 * global period when it lands.
 *
 * @module widgets/crew-utilization/api/get-crew-utilization
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric } from '@/shared/lib/metrics/call';

// ── Types ──────────────────────────────────────────────────────────────────

export type CrewUtilizationDTO = {
  /** Pre-formatted percent string, e.g. "74%" (registry unit='percent'). */
  rateFormatted: string;
  /** Raw fraction 0..1. Drives the green/warning/muted threshold color. */
  rateFraction: number;
  /** Secondary line, e.g. "Marcus 88% utilized". */
  secondary: string | null;
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

export async function getCrewUtilization(): Promise<CrewUtilizationDTO | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const allowed = await hasCapability(user.id, workspaceId, 'planning:view');
  if (!allowed) return null;

  const result = await callMetric(workspaceId, 'ops.crew_utilization', defaultPeriod());

  if (!result.ok || result.kind !== 'scalar') {
    return {
      rateFormatted: '0%',
      rateFraction: 0,
      secondary: null,
      errored: true,
    };
  }

  return {
    rateFormatted: result.value.primaryFormatted,
    rateFraction: Number(result.value.primary ?? 0),
    secondary: result.value.secondary ?? null,
    errored: false,
  };
}

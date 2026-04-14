'use server';

/**
 * QBO variance widget — data fetcher.
 *
 * Reads the `finance.qbo_variance` metric via the metric-registry chokepoint
 * (`callMetric`). Gated on the `finance:reconcile` capability; non-qualifying
 * users get a `null` DTO and never pay the query cost (per Phase 1.4 plan).
 *
 * @module widgets/qbo-variance/api/get-qbo-variance
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { hasCapability } from '@/shared/lib/permissions';
import { callMetric } from '@/shared/lib/metrics/call';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * DTO shaped for the Lobby card. Keeps only what the renderer needs so the
 * client payload stays small; registry copy (title/empty state) is resolved
 * on the server too.
 */
export type QboVarianceDTO = {
  /** Variance count. 0 = clean. */
  count: number;
  /** Pre-formatted count per metric registry (e.g. "3"). */
  countFormatted: string;
  /** Secondary line from the RPC — e.g. "Last sync 2026-04-14 12:00 UTC" or "Not connected". */
  secondary: string | null;
  /** True when the RPC itself failed — render a muted error state. */
  errored: boolean;
  /** True when QBO is not connected (derived from missing/null secondary and count === 0 + registry hint). */
  disconnected: boolean;
};

// ── Fetcher ────────────────────────────────────────────────────────────────

/**
 * Returns the QBO variance DTO, or `null` when the caller lacks the
 * `finance:reconcile` capability. Callers must treat `null` as "hide the card".
 */
export async function getQboVariance(): Promise<QboVarianceDTO | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Role gate covers the query cost, not just the render. Matches the
  // Reconciliation surface gate on `finance:reconcile`.
  const allowed = await hasCapability(user.id, workspaceId, 'finance:reconcile');
  if (!allowed) return null;

  const result = await callMetric(workspaceId, 'finance.qbo_variance');

  if (!result.ok || result.kind !== 'scalar') {
    return {
      count: 0,
      countFormatted: '0',
      secondary: null,
      errored: true,
      disconnected: false,
    };
  }

  const count = result.value.primary ?? 0;
  const secondary = result.value.secondary ?? null;

  // The RPC surfaces "not connected" via the secondary text (see registry.notes).
  // Treat a null/empty secondary with count === 0 as a connection-missing state
  // only if the text hints at it; otherwise it's the happy "all synced" case.
  const disconnected =
    !!secondary &&
    /no qbo connection|not connected|disconnected|connection (canceled|revoked|expired)/i.test(
      secondary,
    );

  return {
    count,
    countFormatted: result.value.primaryFormatted,
    secondary,
    errored: false,
    disconnected,
  };
}

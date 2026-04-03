/**
 * Show (deal) limit utilities for subscription tier enforcement.
 * Calls DB RPCs to count active shows and check limits.
 *
 * @module shared/lib/show-limits
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getMaxActiveShows, type TierSlug } from './tier-config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CanCreateShowResult {
  allowed: boolean;
  current: number;
  /** null means unlimited (Studio tier) */
  limit: number | null;
  /** true when at >= 80% of limit */
  atWarning: boolean;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the number of active shows (non-lost, non-archived deals) in a workspace.
 */
export async function getActiveShowCount(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('count_active_shows', {
    p_workspace_id: workspaceId,
  });
  if (error) {
    throw new Error(`[show-limits] count_active_shows RPC failed: ${error.message}`);
  }
  return (data as number) ?? 0;
}

/**
 * Returns the active show limit for a workspace based on its subscription tier.
 * null = unlimited (Studio tier).
 */
export async function getShowLimit(workspaceId: string): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('subscription_tier')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !data?.subscription_tier) {
    // Fail restrictive — default to Foundation limit (5 shows) rather than null (unlimited)
    console.error('[show-limits] Failed to fetch workspace tier:', error?.message);
    return 5;
  }

  return getMaxActiveShows(data.subscription_tier as TierSlug);
}

/**
 * Checks whether the workspace can create another show (deal).
 * Studio tier (null limit) always returns allowed.
 * atWarning is true when usage >= 80% of limit.
 */
export async function canCreateShow(workspaceId: string): Promise<CanCreateShowResult> {
  const [current, limit] = await Promise.all([
    getActiveShowCount(workspaceId),
    getShowLimit(workspaceId),
  ]);

  // Unlimited (Studio tier)
  if (limit === null) {
    return { allowed: true, current, limit: null, atWarning: false };
  }

  const atWarning = current >= Math.floor(limit * 0.8);

  return {
    allowed: current < limit,
    current,
    limit,
    atWarning,
  };
}

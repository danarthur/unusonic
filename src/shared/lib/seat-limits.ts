/**
 * Seat limit utilities for subscription tier enforcement.
 * Calls DB RPCs to count team seats and check limits.
 *
 * @module shared/lib/seat-limits
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SeatUsage {
  current: number;
  limit: number;
}

export interface CanAddSeatResult {
  allowed: boolean;
  current: number;
  limit: number;
}

// ─── Queries ────────────────────────────────────────────────────────────────

/**
 * Returns the number of team seats currently in use for a workspace.
 * Team seats = all workspace_members EXCEPT those with the employee role.
 */
export async function getWorkspaceSeatUsage(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('count_team_seats', {
    p_workspace_id: workspaceId,
  });
  if (error) {
    throw new Error(`[seat-limits] count_team_seats RPC failed: ${error.message}`);
  }
  return (data as number) ?? 0;
}

/**
 * Returns the total seat limit for a workspace (included + extra).
 */
export async function getWorkspaceSeatLimit(workspaceId: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_workspace_seat_limit', {
    p_workspace_id: workspaceId,
  });
  if (error) {
    throw new Error(`[seat-limits] get_workspace_seat_limit RPC failed: ${error.message}`);
  }
  return (data as number) ?? 0;
}

/**
 * Checks whether the workspace can add another team seat.
 * Returns current usage, limit, and whether the addition is allowed.
 */
export async function canAddSeat(workspaceId: string): Promise<CanAddSeatResult> {
  const [current, limit] = await Promise.all([
    getWorkspaceSeatUsage(workspaceId),
    getWorkspaceSeatLimit(workspaceId),
  ]);

  return {
    allowed: current < limit,
    current,
    limit,
  };
}

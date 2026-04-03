/**
 * Unified access-check helpers for server actions.
 * Combines role-based permission checks (gate 1) with tier-based capability checks (gate 2),
 * plus seat and show limit checks.
 *
 * @module shared/lib/access-check
 */

import 'server-only';

import type { CapabilityKey, TierCapabilityKey } from '@/shared/lib/permission-registry';
import { hasCapability } from './permissions';
import { workspaceHasTierCapability } from './tier-gate';
import { canAddSeat } from './seat-limits';
import { canCreateShow } from './show-limits';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface AccessResult {
  allowed: boolean;
  reason?: 'role' | 'tier';
}

export interface SeatAccessResult {
  allowed: boolean;
  reason?: 'seat_limit';
  current: number;
  limit: number;
}

export interface ShowAccessResult {
  allowed: boolean;
  reason?: 'show_limit';
  current: number;
  limit: number | null;
  atWarning: boolean;
}

// ─── Combined Access Check ─────────────────────────────────────────────────────

/**
 * Checks both role-based and tier-based access in a single call.
 * If both `capability` and `tierCapability` are provided, both must pass.
 * Runs checks in parallel when both are provided.
 */
export async function checkAccess(
  userId: string,
  workspaceId: string,
  opts: { capability?: CapabilityKey; tierCapability?: TierCapabilityKey }
): Promise<AccessResult> {
  const checks: Promise<{ gate: 'role' | 'tier'; allowed: boolean }>[] = [];

  if (opts.capability) {
    checks.push(
      hasCapability(userId, workspaceId, opts.capability).then((allowed) => ({
        gate: 'role' as const,
        allowed,
      }))
    );
  }

  if (opts.tierCapability) {
    checks.push(
      workspaceHasTierCapability(workspaceId, opts.tierCapability).then((allowed) => ({
        gate: 'tier' as const,
        allowed,
      }))
    );
  }

  const results = await Promise.all(checks);

  for (const result of results) {
    if (!result.allowed) {
      return { allowed: false, reason: result.gate };
    }
  }

  return { allowed: true };
}

// ─── Seat Access ───────────────────────────────────────────────────────────────

/**
 * Checks whether the workspace can add another team seat.
 */
export async function checkSeatAccess(workspaceId: string): Promise<SeatAccessResult> {
  const result = await canAddSeat(workspaceId);
  return {
    allowed: result.allowed,
    reason: result.allowed ? undefined : 'seat_limit',
    current: result.current,
    limit: result.limit,
  };
}

// ─── Show Access ───────────────────────────────────────────────────────────────

/**
 * Checks whether the workspace can create another show (deal).
 */
export async function checkShowAccess(workspaceId: string): Promise<ShowAccessResult> {
  const result = await canCreateShow(workspaceId);
  return {
    allowed: result.allowed,
    reason: result.allowed ? undefined : 'show_limit',
    current: result.current,
    limit: result.limit,
    atWarning: result.atWarning,
  };
}

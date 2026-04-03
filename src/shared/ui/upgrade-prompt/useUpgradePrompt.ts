'use client';

import { useEffect, useState, useCallback } from 'react';
import type { WorkspaceUsage } from '@/app/(dashboard)/settings/plan/actions';
import type { TierSlug } from '@/shared/lib/tier-config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UpgradePromptState {
  /** True while the initial fetch is in progress */
  loading: boolean;
  /** True if the seat count is at or above the limit */
  showSeatWarning: boolean;
  /** True if the show count is at or above 80% of the limit */
  showShowWarning: boolean;
  /** True if seats exceed limit (e.g. after downgrade) */
  seatOverLimit: boolean;
  /** True if shows exceed limit (e.g. after downgrade) */
  showOverLimit: boolean;
  /** True if billing is past due */
  billingPastDue: boolean;
  seatUsage: { current: number; limit: number } | null;
  showUsage: { current: number; limit: number | null } | null;
  tier: TierSlug | null;
  /** Suggested tier to upgrade to for seat issues */
  seatTierNeeded: TierSlug | null;
  /** Suggested tier to upgrade to for show issues */
  showTierNeeded: TierSlug | null;
  /** Re-fetch usage data */
  refetch: () => void;
}

// ─── Session cache ──────────────────────────────────────────────────────────

const CACHE_KEY = 'unusonic_upgrade_prompt_cache';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CachedData {
  data: WorkspaceUsage;
  timestamp: number;
}

function getCachedUsage(): WorkspaceUsage | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedData = JSON.parse(raw);
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return cached.data;
  } catch {
    return null;
  }
}

function setCachedUsage(data: WorkspaceUsage): void {
  if (typeof window === 'undefined') return;
  try {
    const cached: CachedData = { data, timestamp: Date.now() };
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
  } catch {
    // sessionStorage full or unavailable — silently skip
  }
}

// ─── Tier suggestion logic ──────────────────────────────────────────────────

const TIER_ORDER: TierSlug[] = ['foundation', 'growth', 'studio'];

function getNextTier(current: TierSlug): TierSlug | null {
  const idx = TIER_ORDER.indexOf(current);
  if (idx === -1 || idx >= TIER_ORDER.length - 1) return null;
  return TIER_ORDER[idx + 1];
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Client-side hook that fetches workspace usage data and returns
 * prompt states for seat limits, show limits, and billing issues.
 *
 * Caches the result in sessionStorage for 5 minutes to avoid
 * re-fetching on every render.
 */
export function useUpgradePrompt(
  workspaceId: string | null,
  fetchUsage: (workspaceId: string) => Promise<WorkspaceUsage | null>,
): UpgradePromptState {
  const [loading, setLoading] = useState(true);
  const [usage, setUsage] = useState<WorkspaceUsage | null>(null);

  const doFetch = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    // Check cache first
    const cached = getCachedUsage();
    if (cached) {
      setUsage(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await fetchUsage(workspaceId);
      if (result) {
        setUsage(result);
        setCachedUsage(result);
      }
    } catch {
      // Silently fail — upgrade prompts are non-critical
    } finally {
      setLoading(false);
    }
  }, [workspaceId, fetchUsage]);

  useEffect(() => {
    doFetch();
  }, [doFetch]);

  const refetch = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(CACHE_KEY);
    }
    doFetch();
  }, [doFetch]);

  // ─── Derive prompt state ────────────────────────────────────────────────

  if (!usage) {
    return {
      loading,
      showSeatWarning: false,
      showShowWarning: false,
      seatOverLimit: false,
      showOverLimit: false,
      billingPastDue: false,
      seatUsage: null,
      showUsage: null,
      tier: null,
      seatTierNeeded: null,
      showTierNeeded: null,
      refetch,
    };
  }

  const seatAtLimit = usage.seatUsage >= usage.seatLimit;
  const seatOverLimit = usage.seatUsage > usage.seatLimit;

  const showHasLimit = usage.showLimit !== null;
  const showAtWarning = showHasLimit && usage.showUsage >= Math.floor(usage.showLimit! * 0.8);
  const showOverLimit = showHasLimit && usage.showUsage > usage.showLimit!;

  const billingPastDue = usage.billingStatus === 'past_due';

  const nextTier = getNextTier(usage.tier);

  return {
    loading,
    showSeatWarning: seatAtLimit,
    showShowWarning: showAtWarning,
    seatOverLimit,
    showOverLimit,
    billingPastDue,
    seatUsage: { current: usage.seatUsage, limit: usage.seatLimit },
    showUsage: { current: usage.showUsage, limit: usage.showLimit },
    tier: usage.tier,
    seatTierNeeded: seatAtLimit ? nextTier : null,
    showTierNeeded: showAtWarning ? nextTier : null,
    refetch,
  };
}

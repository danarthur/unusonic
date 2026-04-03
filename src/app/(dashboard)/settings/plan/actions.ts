'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SubscriptionTier } from '@/features/onboarding/model/subscription-types';
import type { TierSlug } from '@/shared/lib/tier-config';
import { TIER_CONFIG } from '@/shared/lib/tier-config';
import {
  createSubscription,
  updateSubscriptionTier,
  cancelSubscription,
} from '@/shared/api/stripe/subscription';

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the workspace_id and role for the current user.
 */
async function getCallerWorkspace(): Promise<{
  workspaceId: string;
  role: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return null;
  return { workspaceId: membership.workspace_id, role: membership.role ?? '' };
}

// ─── Tier ordering for upgrade/downgrade detection ─────────────────────────────

const TIER_ORDER: Record<TierSlug, number> = {
  foundation: 0,
  growth: 1,
  studio: 2,
};

// ─── Update Workspace Plan ─────────────────────────────────────────────────────

export async function updateWorkspacePlan(
  tier: SubscriptionTier,
): Promise<{ ok: boolean; error?: string }> {
  const caller = await getCallerWorkspace();
  if (!caller) return { ok: false, error: 'Not authenticated' };

  if (caller.role !== 'owner' && caller.role !== 'admin') {
    return { ok: false, error: 'Only workspace owners can change the plan' };
  }

  const { workspaceId } = caller;

  // Fetch current workspace state for upgrade/downgrade detection
  const supabase = await createClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('subscription_tier, stripe_subscription_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (!workspace) return { ok: false, error: 'Workspace not found' };

  const currentTier = (workspace.subscription_tier as TierSlug) ?? 'foundation';
  const newTier = tier as TierSlug;

  // No-op if same tier
  if (currentTier === newTier) {
    return { ok: true };
  }

  const isDowngrade = TIER_ORDER[newTier] < TIER_ORDER[currentTier];

  // For downgrades, validate the workspace isn't over the new tier's limits
  if (isDowngrade) {
    const newConfig = TIER_CONFIG[newTier];

    // For downgrades, check if current usage exceeds new tier's included seats + extra
    const { getWorkspaceSeatUsage } = await import('@/shared/lib/seat-limits');
    const currentSeats = await getWorkspaceSeatUsage(workspaceId);
    const newSeatLimit = newConfig.includedSeats + ((workspace as any).extra_seats ?? 0);

    if (currentSeats > newSeatLimit) {
      return {
        ok: false,
        error: `Your workspace has ${currentSeats} team members but the ${newConfig.label} plan includes ${newConfig.includedSeats}. Remove members or purchase extra seats before downgrading.`,
      };
    }

    // Check show limits
    if (newConfig.maxActiveShows !== null) {
      const { getActiveShowCount } = await import('@/shared/lib/show-limits');
      const activeShows = await getActiveShowCount(workspaceId);

      if (activeShows > newConfig.maxActiveShows) {
        return {
          ok: false,
          error: `Your workspace has ${activeShows} active shows but the ${newConfig.label} plan allows ${newConfig.maxActiveShows}. Archive shows before downgrading.`,
        };
      }
    }
  }

  // Route to the appropriate Stripe function
  let result: { ok: boolean; error?: string };

  if (workspace.stripe_subscription_id) {
    // Existing subscription — update tier
    result = await updateSubscriptionTier(workspaceId, newTier);
  } else {
    // No subscription yet — create one
    const createResult = await createSubscription(workspaceId, newTier);
    result = { ok: createResult.ok, error: createResult.error };
  }

  if (!result.ok) return result;

  revalidatePath('/settings/plan');
  revalidatePath('/settings');
  return { ok: true };
}

// ─── Cancel Plan ───────────────────────────────────────────────────────────────

export async function cancelWorkspacePlan(): Promise<{ ok: boolean; error?: string }> {
  const caller = await getCallerWorkspace();
  if (!caller) return { ok: false, error: 'Not authenticated' };

  if (caller.role !== 'owner' && caller.role !== 'admin') {
    return { ok: false, error: 'Only workspace owners can cancel the plan' };
  }

  const result = await cancelSubscription(caller.workspaceId);

  if (result.ok) {
    revalidatePath('/settings/plan');
    revalidatePath('/settings');
  }

  return result;
}

// ─── Get Workspace Usage ───────────────────────────────────────────────────────

export interface WorkspaceUsage {
  seatUsage: number;
  seatLimit: number;
  showUsage: number;
  showLimit: number | null;
  tier: TierSlug;
  billingStatus: string;
}

export async function getWorkspaceUsage(
  workspaceId: string,
): Promise<WorkspaceUsage | null> {
  const supabase = await createClient();

  // Verify the caller has access to this workspace
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!membership) return null;

  // Fetch workspace tier and billing status
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('subscription_tier, billing_status')
    .eq('id', workspaceId)
    .maybeSingle();

  if (!workspace) return null;

  const tier = (workspace.subscription_tier as TierSlug) ?? 'foundation';

  // Parallel fetch of seat and show usage
  const { getWorkspaceSeatUsage, getWorkspaceSeatLimit } = await import(
    '@/shared/lib/seat-limits'
  );
  const { getActiveShowCount } = await import('@/shared/lib/show-limits');
  const { getMaxActiveShows } = await import('@/shared/lib/tier-config');

  const [seatUsage, seatLimit, showUsage] = await Promise.all([
    getWorkspaceSeatUsage(workspaceId),
    getWorkspaceSeatLimit(workspaceId),
    getActiveShowCount(workspaceId),
  ]);

  const showLimit = getMaxActiveShows(tier);

  return {
    seatUsage,
    seatLimit,
    showUsage,
    showLimit,
    tier,
    billingStatus: (workspace.billing_status as string) ?? 'active',
  };
}

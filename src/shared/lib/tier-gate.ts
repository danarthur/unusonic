/**
 * Tier-to-capability gating.
 * Checks whether a workspace's subscription tier includes a given feature capability.
 * This is the second gate in the two-gate access model (role gate + tier gate).
 *
 * @module shared/lib/tier-gate
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import type { TierCapabilityKey } from './permission-registry';
import type { TierSlug } from './tier-config';

// ─── Tier → Capability Map ────────────────────────────────────────────────────

export const TIER_CAPABILITIES: Record<TierSlug, TierCapabilityKey[]> = {
  foundation: [],
  growth: [
    'tier:aion:active',
    'tier:custom_roles',
    'tier:advanced_reporting',
    'tier:bulk_dispatch',
  ],
  studio: [
    'tier:aion:active',
    'tier:aion:autonomous',
    'tier:custom_roles',
    'tier:advanced_reporting',
    'tier:bulk_dispatch',
    'tier:multi_venue',
    'tier:geofencing',
  ],
};

/** Ordered from lowest to highest for minimum-tier derivation. */
const TIER_ORDER: TierSlug[] = ['foundation', 'growth', 'studio'];

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetches the workspace's current subscription tier from the DB.
 * Defaults to 'foundation' if not found (safe fallback — most restrictive tier).
 */
export async function getWorkspaceTier(workspaceId: string): Promise<TierSlug> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('subscription_tier')
    .eq('id', workspaceId)
    .single();

  if (error || !data?.subscription_tier) return 'foundation';
  return data.subscription_tier as TierSlug;
}

/**
 * Returns true if the workspace's tier includes the given capability key.
 */
export async function workspaceHasTierCapability(
  workspaceId: string,
  capabilityKey: TierCapabilityKey
): Promise<boolean> {
  const tier = await getWorkspaceTier(workspaceId);
  return TIER_CAPABILITIES[tier].includes(capabilityKey);
}

/**
 * Returns the lowest tier that includes the given capability key,
 * or null if no tier provides it.
 * Useful for upgrade prompts: "Upgrade to Growth to unlock..."
 */
export function getMinimumTierForCapability(capabilityKey: TierCapabilityKey): TierSlug | null {
  for (const tier of TIER_ORDER) {
    if (TIER_CAPABILITIES[tier].includes(capabilityKey)) return tier;
  }
  return null;
}

/**
 * Throws if the workspace's tier does not include the given capability.
 * Error message includes the current tier and the minimum required tier.
 */
export async function requireTierCapability(
  workspaceId: string,
  capabilityKey: TierCapabilityKey
): Promise<void> {
  const tier = await getWorkspaceTier(workspaceId);
  if (TIER_CAPABILITIES[tier].includes(capabilityKey)) return;

  const minimumTier = getMinimumTierForCapability(capabilityKey);
  const minimumLabel = minimumTier
    ? minimumTier.charAt(0).toUpperCase() + minimumTier.slice(1)
    : 'unknown';

  throw new Error(
    `Tier capability '${capabilityKey}' requires ${minimumLabel} plan (current: ${tier})`
  );
}

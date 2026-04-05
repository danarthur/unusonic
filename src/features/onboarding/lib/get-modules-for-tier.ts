/**
 * Returns the enabled modules for a given subscription tier.
 * Drives agent_configs.modules_enabled during onboarding.
 * @module features/onboarding/lib/get-modules-for-tier
 */

import type { SubscriptionTier } from '../model/subscription-types';

const TIER_MODULES: Record<SubscriptionTier, string[]> = {
  foundation: ['crm', 'calendar', 'proposals'],
  growth: ['crm', 'calendar', 'proposals', 'team', 'sms', 'reports', 'dispatch'],
  studio: ['crm', 'calendar', 'proposals', 'team', 'sms', 'reports', 'dispatch', 'multi_venue', 'geofencing'],
};

export function getModulesForTier(tier: SubscriptionTier): string[] {
  return TIER_MODULES[tier] ?? TIER_MODULES.foundation;
}

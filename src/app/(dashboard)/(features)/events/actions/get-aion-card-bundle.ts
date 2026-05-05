'use server';

/**
 * Bundled fetch for the unified Aion deal card — couples the workspace
 * feature flag with the card data in a single round-trip so the client
 * component can branch without flashing legacy then new.
 *
 * Phase 3 thin wrapper; Phase 4 keeps this shape once the OFF path is
 * removed.
 */

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { isFeatureEnabled, FEATURE_FLAGS } from '@/shared/lib/feature-flags';
import {
  resolveAionCardForDeal,
  type AionCardData,
} from './get-aion-card-for-deal';

export type AionCardBundle = {
  enabled: boolean;
  data: AionCardData | null;
};

export async function getAionCardBundle(dealId: string): Promise<AionCardBundle> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { enabled: false, data: null };

  const enabled = await isFeatureEnabled(workspaceId, FEATURE_FLAGS.CRM_UNIFIED_AION_CARD);
  if (!enabled) return { enabled: false, data: null };

  const data = await resolveAionCardForDeal(dealId);
  return { enabled: true, data };
}

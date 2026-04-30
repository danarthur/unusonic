'use server';

/**
 * Tiny server action exposing the `crm.gear_lineage_v1` flag to the
 * GearFlightCheck client component (Phase 2b of proposal-gear-lineage-plan).
 *
 * Lives next to the gear actions so the orchestrator owns its own gate
 * rather than asking every parent to drill the value down.
 */

import { isFeatureEnabled, FEATURE_FLAGS } from '@/shared/lib/feature-flags';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export async function getGearLineageEnabled(): Promise<boolean> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return false;
  return isFeatureEnabled(workspaceId, FEATURE_FLAGS.CRM_GEAR_LINEAGE_V1);
}

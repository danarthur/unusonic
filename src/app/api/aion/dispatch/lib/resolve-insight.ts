/**
 * Resolve an Aion insight after a successful dispatch action.
 * Uses system client because cortex writes are RPC-only.
 */

import { getSystemClient } from '@/shared/api/supabase/system';

export async function resolveInsight(
  triggerType: string,
  entityId: string,
): Promise<void> {
  const system = getSystemClient();

  try {
    await system.schema('cortex').rpc('resolve_aion_insight', {
      p_trigger_type: triggerType,
      p_entity_id: entityId,
    });
  } catch (err) {
    console.error(`[aion/dispatch] Failed to resolve insight ${triggerType}/${entityId}:`, err);
  }
}

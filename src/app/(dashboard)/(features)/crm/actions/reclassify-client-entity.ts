'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { INDIVIDUAL_ATTR, COUPLE_ATTR, COMPANY_ATTR } from '@/features/network-data/model/attribute-keys';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { revalidatePath } from 'next/cache';

// Keys to null out when moving away from a given type.
// `category`, `is_ghost`, `is_claimed`, `created_by_org_id` are cross-type markers — never nulled.
const PRESERVED_KEYS = new Set<string>([
  COMPANY_ATTR.category, COMPANY_ATTR.is_ghost, COMPANY_ATTR.is_claimed, COMPANY_ATTR.created_by_org_id,
]);

const STALE_KEYS_BY_TYPE: Partial<Record<string, Record<string, null>>> = {
  couple: Object.fromEntries(Object.values(COUPLE_ATTR).map(k => [k, null])),
  person: Object.fromEntries(
    Object.values(INDIVIDUAL_ATTR).filter(k => !PRESERVED_KEYS.has(k)).map(k => [k, null])
  ),
  company: Object.fromEntries(
    Object.values(COMPANY_ATTR).filter(k => !PRESERVED_KEYS.has(k)).map(k => [k, null])
  ),
};

export type ClientEntityType = 'company' | 'person' | 'couple';

export type ReclassifyClientResult = { success: true } | { success: false; error: string };

/**
 * Change the entity type of a ghost client entity.
 * Only works on entities owned by the current workspace.
 * Used to correct mistakes (e.g. company → person, or person → couple).
 */
export async function reclassifyClientEntity(
  entityId: string,
  newType: ClientEntityType
): Promise<ReclassifyClientResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Verify the entity exists, belongs to this workspace, and is a ghost client
  const { data: entity } = await supabase
    .schema('directory').from('entities')
    .select('id, type, attributes')
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (!entity) return { success: false, error: 'Entity not found.' };

  // Use typed accessor for the category guard — if the key name ever changes in
  // attribute-keys.ts, this read updates automatically rather than silently returning undefined.
  const entityType = entity.type as string;
  const attrType = entityType === 'couple' ? 'couple' : entityType === 'person' ? 'individual' : 'company';
  const attrs = readEntityAttrs(entity.attributes, attrType as Parameters<typeof readEntityAttrs>[1]);
  if ((attrs as { category?: string | null }).category !== 'client') {
    return { success: false, error: 'Only client entities can be reclassified.' };
  }

  const { error } = await supabase
    .schema('directory').from('entities')
    .update({ type: newType })
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };

  // Null out stale JSONB keys from the old type so Aion doesn't see orphaned data.
  // Log but do not fail the reclassify if the null-out fails — the type change succeeded
  // and a stale key is a data quality issue, not a correctness failure.
  const staleKeys = STALE_KEYS_BY_TYPE[entity.type as string];
  if (staleKeys) {
    const { error: nullOutError } = await supabase.rpc('patch_entity_attributes', {
      p_entity_id: entityId,
      p_attributes: staleKeys,
    });
    if (nullOutError) {
      console.error('[reclassify] stale-key null-out failed:', nullOutError.message);
    }
  }

  revalidatePath('/crm');
  revalidatePath('/network');
  return { success: true };
}

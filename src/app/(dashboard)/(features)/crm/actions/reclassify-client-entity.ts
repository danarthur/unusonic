'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

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

  const attrs = (entity.attributes as Record<string, unknown>) ?? {};
  if (attrs.category !== 'client') {
    return { success: false, error: 'Only client entities can be reclassified.' };
  }

  const { error } = await supabase
    .schema('directory').from('entities')
    .update({ type: newType })
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/crm');
  return { success: true };
}

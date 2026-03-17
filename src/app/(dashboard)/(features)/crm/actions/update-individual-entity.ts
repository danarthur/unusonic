'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { INDIVIDUAL_ATTR } from '@/features/network-data/model/attribute-keys';
import { revalidatePath } from 'next/cache';

export type UpdateIndividualInput = {
  entityId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  displayName: string;
};

export type UpdateIndividualResult = { success: true } | { success: false; error: string };

export async function updateIndividualEntity(input: UpdateIndividualInput): Promise<UpdateIndividualResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };
  const supabase = await createClient();

  // Update display_name with workspace scope guard
  const { error: nameError } = await supabase
    .schema('directory').from('entities')
    .update({ display_name: input.displayName })
    .eq('id', input.entityId)
    .eq('owner_workspace_id', workspaceId);
  if (nameError) return { success: false, error: nameError.message };

  // Patch individual-specific JSONB keys — safe || merge via RPC, never nukes other fields
  const { error: attrError } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: input.entityId,
    p_attributes: {
      category: 'client',
      [INDIVIDUAL_ATTR.first_name]: input.firstName,
      [INDIVIDUAL_ATTR.last_name]: input.lastName,
      [INDIVIDUAL_ATTR.email]: input.email ?? null,
      [INDIVIDUAL_ATTR.phone]: input.phone ?? null,
    },
  });
  if (attrError) return { success: false, error: attrError.message };

  revalidatePath('/crm');
  return { success: true };
}

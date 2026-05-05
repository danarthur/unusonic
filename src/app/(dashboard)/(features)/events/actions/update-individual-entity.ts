'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { INDIVIDUAL_ATTR } from '@/features/network-data/model/attribute-keys';
import { IndividualAttrsSchema } from '@/shared/lib/entity-attrs';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';

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

  // Validate attribute patch through schema before writing.
  // The RPC receives the Zod-parsed result — not the raw input — so only schema-validated
  // fields reach the database.
  const patch = {
    category: 'client',
    [INDIVIDUAL_ATTR.first_name]: input.firstName,
    [INDIVIDUAL_ATTR.last_name]: input.lastName,
    [INDIVIDUAL_ATTR.email]: input.email ?? null,
    [INDIVIDUAL_ATTR.phone]: input.phone ?? null,
  };
  let validatedPatch: typeof patch;
  try {
    validatedPatch = IndividualAttrsSchema.partial().parse(patch) as typeof patch;
  } catch (err) {
    if (err instanceof ZodError) return { success: false, error: 'Invalid field values.' };
    throw err;
  }

  // Patch individual-specific JSONB keys — safe || merge via RPC, never nukes other fields
  const { error: attrError } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: input.entityId,
    p_attributes: validatedPatch,
  });
  if (attrError) return { success: false, error: attrError.message };

  revalidatePath('/events');
  revalidatePath('/network');
  return { success: true };
}

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { PersonAttrsSchema } from '@/shared/lib/entity-attrs';
import { PERSON_ATTR } from '@/features/network-data/model/attribute-keys';

const updatePreferredPersonSchema = z.object({
  entityId: z.string().uuid(),
  firstName: z.string().max(100),
  lastName: z.string().max(100),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().max(40).optional(),
  jobTitle: z.string().max(120).optional(),
});

export type UpdatePreferredPersonResult = { success: true } | { success: false; error: string };

export async function updatePreferredPerson(
  input: unknown,
): Promise<UpdatePreferredPersonResult> {
  const parsed = updatePreferredPersonSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const { entityId, firstName, lastName, email, phone, jobTitle } = parsed.data;
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not signed in.' };

  const supabase = await createClient();

  const displayName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Unknown';

  // Update display_name with workspace guard
  const { error: nameErr } = await supabase
    .schema('directory')
    .from('entities')
    .update({ display_name: displayName })
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId);
  if (nameErr) return { success: false, error: nameErr.message };

  // Build and validate attribute patch
  const rawPatch = {
    [PERSON_ATTR.first_name]: firstName || null,
    [PERSON_ATTR.last_name]: lastName || null,
    [PERSON_ATTR.email]: email || null,
    [PERSON_ATTR.phone]: phone || null,
    [PERSON_ATTR.job_title]: jobTitle || null,
  };

  const validatedPatch = PersonAttrsSchema.partial().parse(rawPatch);

  const { error: attrErr } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: validatedPatch,
  });
  if (attrErr) return { success: false, error: attrErr.message };

  revalidatePath('/network');
  return { success: true };
}

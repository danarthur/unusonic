'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { COUPLE_ATTR } from '@/features/network-data/model/attribute-keys';
import { CoupleAttrsSchema } from '@/shared/lib/entity-attrs';
import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';

export type UpdateCoupleInput = {
  entityId: string;
  partnerAFirst: string;
  partnerALast: string;
  partnerAEmail?: string | null;
  partnerBFirst: string;
  partnerBLast: string;
  partnerBEmail?: string | null;
  displayName: string;
};

export type UpdateCoupleResult = { success: true } | { success: false; error: string };

export async function updateCoupleEntity(input: UpdateCoupleInput): Promise<UpdateCoupleResult> {
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

  // Validate full attribute patch through schema before writing.
  // category is included so the complete RPC payload is validated.
  // The RPC receives the Zod-parsed result — not the raw input — so only schema-validated
  // fields reach the database.
  const patch = {
    [COUPLE_ATTR.partner_a_first]: input.partnerAFirst,
    [COUPLE_ATTR.partner_a_last]: input.partnerALast,
    [COUPLE_ATTR.partner_a_email]: input.partnerAEmail ?? null,
    [COUPLE_ATTR.partner_b_first]: input.partnerBFirst,
    [COUPLE_ATTR.partner_b_last]: input.partnerBLast,
    [COUPLE_ATTR.partner_b_email]: input.partnerBEmail ?? null,
    category: 'client' as const,
  };
  let validatedPatch: typeof patch;
  try {
    validatedPatch = CoupleAttrsSchema.partial().parse(patch) as typeof patch;
  } catch (err) {
    if (err instanceof ZodError) return { success: false, error: 'Invalid field values.' };
    throw err;
  }

  // Patch only couple-specific JSONB keys — uses safe || merge, never nukes other fields.
  // patch_entity_attributes RPC strips ghost sentinel keys (is_ghost, claimed_by_user_id)
  // so ghost status is preserved correctly without being overwritten.
  const { error: attrError } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: input.entityId,
    p_attributes: validatedPatch,
  });
  if (attrError) return { success: false, error: attrError.message };

  revalidatePath('/crm');
  revalidatePath('/network');
  return { success: true };
}

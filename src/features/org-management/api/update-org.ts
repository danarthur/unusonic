'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { updateOrgSchema } from '@/entities/organization/model/schema';
import type { UpdateOrgInput } from '@/entities/organization/model/schema';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

export type UpdateOrgResult = { ok: true } | { ok: false; error: string };

/** Update organization profile. Writes to directory.entities (public.organizations dropped in Session 10). */
export async function updateOrg(input: UpdateOrgInput): Promise<UpdateOrgResult> {
  const parsed = updateOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Unauthorized.' };

  const supabase = await createClient();
  const { org_id, ...payload } = parsed.data;

  // Resolve entity once with workspace scope guard
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .or(`id.eq.${org_id},legacy_org_id.eq.${org_id}`)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (!entity) return { ok: false, error: 'Organization not found.' };

  // Top-level column updates
  const colUpdate: Record<string, unknown> = {};
  if (payload.name !== undefined) colUpdate.display_name = payload.name;
  if (payload.logo_url !== undefined) colUpdate.avatar_url = payload.logo_url ?? null;

  if (Object.keys(colUpdate).length > 0) {
    const { error } = await supabase
      .schema('directory')
      .from('entities')
      .update(colUpdate)
      .eq('id', entity.id);
    if (error) return { ok: false, error: error.message };
  }

  // JSONB attribute patch via safe merge RPC
  const attrPatch: Record<string, unknown> = {};
  if (payload.description !== undefined) attrPatch.description = payload.description ?? null;
  if (payload.brand_color !== undefined) attrPatch.brand_color = payload.brand_color ?? null;
  if (payload.website !== undefined) attrPatch.website = payload.website === '' ? null : payload.website;
  if (payload.support_email !== undefined) attrPatch.support_email = payload.support_email === '' ? null : payload.support_email;
  if (payload.default_currency !== undefined) attrPatch.default_currency = payload.default_currency ?? null;
  if (payload.address !== undefined) attrPatch.address = payload.address ?? null;
  if (payload.social_links !== undefined) attrPatch.social_links = payload.social_links ?? null;
  if (payload.operational_settings !== undefined) attrPatch.operational_settings = payload.operational_settings ?? null;

  if (Object.keys(attrPatch).length > 0) {
    const { error } = await supabase.rpc('patch_entity_attributes', {
      p_entity_id: entity.id,
      p_attributes: attrPatch,
    });
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/network');
  revalidatePath('/crm');
  return { ok: true };
}

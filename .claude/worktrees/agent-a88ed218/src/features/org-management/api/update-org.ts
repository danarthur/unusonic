'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { updateOrgSchema } from '@/entities/organization/model/schema';
import type { UpdateOrgInput } from '@/entities/organization/model/schema';

export type UpdateOrgResult = { ok: true } | { ok: false; error: string };

/** Update organization profile (Identity, Operations). RLS: only admins/members of the org. */
export async function updateOrg(input: UpdateOrgInput): Promise<UpdateOrgResult> {
  const parsed = updateOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { org_id, ...payload } = parsed.data;

  const toUpdate: Record<string, unknown> = {};
  if (payload.name !== undefined) toUpdate.name = payload.name;
  if (payload.description !== undefined) toUpdate.description = payload.description ?? null;
  if (payload.brand_color !== undefined) toUpdate.brand_color = payload.brand_color ?? null;
  if (payload.website !== undefined) toUpdate.website = payload.website === '' ? null : payload.website;
  if (payload.logo_url !== undefined) toUpdate.logo_url = payload.logo_url ?? null;
  if (payload.support_email !== undefined) toUpdate.support_email = payload.support_email === '' ? null : payload.support_email;
  if (payload.default_currency !== undefined) toUpdate.default_currency = payload.default_currency ?? null;
  if (payload.address !== undefined) toUpdate.address = payload.address ?? null;
  if (payload.social_links !== undefined) toUpdate.social_links = payload.social_links ?? null;
  if (payload.operational_settings !== undefined) toUpdate.operational_settings = payload.operational_settings ?? null;

  if (Object.keys(toUpdate).length === 0) return { ok: true };

  const { error } = await supabase
    .from('organizations')
    .update(toUpdate)
    .eq('id', org_id);

  if (error) return { ok: false, error: error.message };

  // Dual-write: sync to directory.entities (new schema)
  // Fetch the updated row so we can rebuild the full attributes object.
  const { data: fresh } = await supabase
    .from('organizations')
    .select('name, slug, logo_url, description, brand_color, website, tier, address, social_links, support_email, default_currency, is_ghost, is_claimed, operational_settings, category')
    .eq('id', org_id)
    .maybeSingle();

  if (fresh) {
    const f = fresh as Record<string, unknown>;
    await supabase
      .schema('directory')
      .from('entities')
      .update({
        display_name: f.name as string,
        handle: (f.slug as string | null) ?? null,
        avatar_url: (f.logo_url as string | null) ?? null,
        attributes: {
          description: f.description ?? null,
          website: f.website ?? null,
          brand_color: f.brand_color ?? null,
          tier: f.tier ?? null,
          address: f.address ?? null,
          social_links: f.social_links ?? null,
          support_email: f.support_email ?? null,
          default_currency: f.default_currency ?? null,
          is_ghost: f.is_ghost ?? false,
          is_claimed: f.is_claimed ?? true,
          operational_settings: f.operational_settings ?? null,
          category: f.category ?? null,
        },
      })
      .eq('legacy_org_id', org_id);
    // Non-fatal: if directory.entities sync fails, public.organizations is still updated.
  }

  return { ok: true };
}

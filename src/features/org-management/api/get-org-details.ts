'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { OrgDetails, OrgAddress, OrgSocialLinks, OrgOperationalSettings } from '@/entities/organization';
import { COMPANY_ATTR } from '@/features/network-data/model/attribute-keys';

/** Fetch full organization details for Event Studio. RLS: only members/admins of the org. */
export async function getOrgDetails(orgId: string): Promise<OrgDetails | null> {
  const supabase = await createClient();

  // Resolve by entity id directly, or by legacy_org_id for migrated records
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, handle, avatar_url, attributes, owner_workspace_id, created_at, updated_at')
    .or(`id.eq.${orgId},legacy_org_id.eq.${orgId}`)
    .maybeSingle();

  if (entity) {
    const attrs = (entity.attributes as Record<string, unknown>) ?? {};
    return {
      id: orgId,
      name: entity.display_name,
      slug: entity.handle ?? null,
      workspace_id: entity.owner_workspace_id ?? '',
      category: (attrs[COMPANY_ATTR.category] as string | null) ?? null,
      is_claimed: (attrs[COMPANY_ATTR.is_claimed] as boolean) ?? true,
      is_ghost: (attrs[COMPANY_ATTR.is_ghost] as boolean) ?? false,
      created_at: entity.created_at ?? null,
      updated_at: entity.updated_at ?? null,
      brand_color: (attrs[COMPANY_ATTR.brand_color] as string | null) ?? null,
      website: (attrs[COMPANY_ATTR.website] as string | null) ?? null,
      logo_url: entity.avatar_url ?? null,
      description: (attrs[COMPANY_ATTR.description] as string | null) ?? null,
      address: (attrs[COMPANY_ATTR.address] as OrgAddress | null) ?? null,
      social_links: (attrs[COMPANY_ATTR.social_links] as OrgSocialLinks | null) ?? null,
      operational_settings: (attrs[COMPANY_ATTR.operational_settings] as OrgOperationalSettings | null) ?? null,
      support_email: (attrs[COMPANY_ATTR.support_email] as string | null) ?? null,
      default_currency: (attrs[COMPANY_ATTR.default_currency] as string | null) ?? null,
    };
  }

  return null;
}

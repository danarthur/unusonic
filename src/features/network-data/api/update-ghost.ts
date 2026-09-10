/**
 * Update Ghost Organization profile. Only the workspace that owns the ghost may update.
 * @module features/network-data/api/update-ghost
 */

'use server';

import 'server-only';
import { buildAddressPatch } from '@/shared/lib/entity-address';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { CompanyAttrsSchema } from '@/shared/lib/entity-attrs';
import { COMPANY_ATTR } from '@/features/network-data/model/attribute-keys';
import { ZodError } from 'zod';
import type { JsonObject } from '@/shared/lib/jsonb';

function nameValid(v: string): boolean {
  return typeof v === 'string' && v.trim().length > 1;
}
function websiteValid(v: string): boolean {
  if (v == null || v === '') return true;
  return typeof v === 'string' && v.includes('.');
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() || '' : '';
}

function strOrNull(v: unknown): string | null {
  const s = str(v);
  return s ? s : null;
}

export type UpdateGhostProfilePayload = {
  name: string;
  website?: string | null;
  brandColor?: string | null;
  logoUrl?: string | null;
  doingBusinessAs?: string | null;
  entityType?: 'organization' | 'single_operator' | null;
  supportEmail?: string | null;
  phone?: string | null;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  } | null;
  defaultCurrency?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  /**
   * Company compliance. Lives in operational_settings beside tax_id and
   * payment_terms rather than at the top of attributes: that bag is what
   * `orgOperationalSettings` exposes and what the record page reads, and a
   * second home for the same fact is how the two drift.
   */
  w9Status?: boolean | null;
  coiExpiry?: string | null;
  category?: string | null;
};

export async function updateGhostProfile(
  ghostOrgId: string,
  formData: FormData | UpdateGhostProfilePayload
): Promise<{ success?: true; error?: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { error: 'Unauthorized' };

  const supabase = await createClient();

  const isFormData = formData instanceof FormData;
  const name = isFormData
    ? ((formData as FormData).get('name') as string) ?? ''
    : (formData as UpdateGhostProfilePayload).name;
  const website = isFormData
    ? strOrNull((formData as FormData).get('website'))
    : (formData as UpdateGhostProfilePayload).website ?? null;
  const brandColor = isFormData
    ? strOrNull((formData as FormData).get('brandColor'))
    : (formData as UpdateGhostProfilePayload).brandColor ?? null;
  const logoUrl = isFormData
    ? strOrNull((formData as FormData).get('logoUrl'))
    : (formData as UpdateGhostProfilePayload).logoUrl ?? null;

  if (!nameValid(name)) return { error: 'Name is required.' };
  if (!websiteValid(website ?? '')) return { error: 'Website must contain a domain.' };

  const doingBusinessAs = isFormData
    ? strOrNull((formData as FormData).get('doingBusinessAs'))
    : (formData as UpdateGhostProfilePayload).doingBusinessAs ?? null;
  const entityType = isFormData
    ? strOrNull((formData as FormData).get('entityType')) as 'organization' | 'single_operator' | null
    : (formData as UpdateGhostProfilePayload).entityType ?? null;
  const supportEmail = isFormData
    ? strOrNull((formData as FormData).get('supportEmail'))
    : (formData as UpdateGhostProfilePayload).supportEmail ?? null;
  const phoneVal = isFormData
    ? strOrNull((formData as FormData).get('phone'))
    : (formData as UpdateGhostProfilePayload).phone ?? null;
  const defaultCurrency = isFormData
    ? strOrNull((formData as FormData).get('defaultCurrency'))
    : (formData as UpdateGhostProfilePayload).defaultCurrency ?? null;
  const taxId = isFormData
    ? strOrNull((formData as FormData).get('taxId'))
    : (formData as UpdateGhostProfilePayload).taxId ?? null;
  const paymentTerms = isFormData
    ? strOrNull((formData as FormData).get('paymentTerms'))
    : (formData as UpdateGhostProfilePayload).paymentTerms ?? null;
  const w9Status = isFormData
    ? (() => {
        const raw = (formData as FormData).get('w9Status');
        return raw === null ? null : raw === 'true';
      })()
    : (formData as UpdateGhostProfilePayload).w9Status ?? null;
  const coiExpiry = isFormData
    ? strOrNull((formData as FormData).get('coiExpiry'))
    : (formData as UpdateGhostProfilePayload).coiExpiry ?? null;
  const category = isFormData
    ? strOrNull((formData as FormData).get('category'))
    : (formData as UpdateGhostProfilePayload).category ?? null;

  let address: UpdateGhostProfilePayload['address'] = null;
  if (isFormData) {
    const street = strOrNull((formData as FormData).get('address_street'));
    const city = strOrNull((formData as FormData).get('address_city'));
    const state = strOrNull((formData as FormData).get('address_state'));
    const postal_code = strOrNull((formData as FormData).get('address_postal_code'));
    const country = strOrNull((formData as FormData).get('address_country'));
    if (street || city || state || postal_code || country) {
      address = { street: street ?? undefined, city: city ?? undefined, state: state ?? undefined, postal_code: postal_code ?? undefined, country: country ?? undefined };
    }
  } else {
    address = (formData as UpdateGhostProfilePayload).address ?? null;
  }

  // Resolve entity — accepts both direct entity UUID and legacy_org_id
  const { data: ghost } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, attributes')
    .or(`id.eq.${ghostOrgId},legacy_org_id.eq.${ghostOrgId}`)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (!ghost) return { error: 'You do not have clearance to edit this entity.' };

  // Update display_name — workspace guard is defence-in-depth alongside RLS
  const { error: nameError } = await supabase
    .schema('directory')
    .from('entities')
    .update({ display_name: name.trim(), avatar_url: logoUrl })
    .eq('id', ghost.id)
    .eq('owner_workspace_id', workspaceId);

  if (nameError) return { error: nameError.message };

  // Merge operational settings safely
  const existingAttrs = (ghost.attributes as Record<string, unknown>) ?? {};
  const existingOps = (existingAttrs[COMPANY_ATTR.operational_settings] as JsonObject) ?? {};
  const ops: JsonObject = {
    ...existingOps,
    doing_business_as: doingBusinessAs ?? existingOps.doing_business_as ?? null,
    entity_type: entityType ?? existingOps.entity_type ?? null,
    tax_id: taxId ?? existingOps.tax_id ?? null,
    payment_terms: paymentTerms ?? existingOps.payment_terms ?? null,
    // A false W-9 is a real answer, so `??` on a boolean would pin it to true
    // once set. Only an absent field falls through to the existing value.
    w9_status: w9Status === null ? existingOps.w9_status ?? null : w9Status,
    coi_expiry: coiExpiry ?? existingOps.coi_expiry ?? null,
    phone: phoneVal ?? existingOps.phone ?? null,
  };

  const attrPatch: JsonObject = {
    [COMPANY_ATTR.website]: website?.trim() || null,
    [COMPANY_ATTR.brand_color]: brandColor?.trim() || null,
    [COMPANY_ATTR.support_email]: supportEmail?.trim() || null,
    [COMPANY_ATTR.default_currency]: defaultCurrency?.trim() || null,
    [COMPANY_ATTR.operational_settings]: ops,
    // Write every address shape, not just the nested object: formatted_address
    // feeds the client-facing proposal and the event's venue address, so an
    // address corrected here used to stay stale on both.
    ...(address !== null
      ? buildAddressPatch({
          street: address.street ?? '',
          city: address.city ?? '',
          state: address.state ?? '',
          postal_code: address.postal_code ?? '',
          country: address.country ?? '',
        })
      : {}),
    ...(category !== null ? { [COMPANY_ATTR.category]: category } : {}),
  };

  // Validate attribute patch through schema before writing
  try {
    CompanyAttrsSchema.partial().parse(attrPatch);
  } catch (err) {
    if (err instanceof ZodError) return { error: 'Invalid field values.' };
    throw err;
  }

  const { error: attrError } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: ghost.id,
    p_attributes: attrPatch,
  });

  if (attrError) return { error: attrError.message };

  revalidatePath('/network');
  revalidatePath('/events');
  return { success: true };
}

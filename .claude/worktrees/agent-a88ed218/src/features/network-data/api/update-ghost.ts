/**
 * Update Ghost Organization profile. Only the org that created the ghost may update.
 * @module features/network-data/api/update-ghost
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';

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
  category?: string | null;
};

export async function updateGhostProfile(
  ghostOrgId: string,
  formData: FormData | UpdateGhostProfilePayload
): Promise<{ success?: true; error?: string }> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Unauthorized' };

  const { data: entity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!entity) return { error: 'Unauthorized' };

  const { data: aff } = await supabase
    .from('affiliations')
    .select('organization_id')
    .eq('entity_id', entity.id)
    .in('access_level', ['admin', 'member', 'read_only'])
    .limit(1)
    .maybeSingle();
  const currentOrgId = aff?.organization_id ?? null;
  if (!currentOrgId) return { error: 'Unauthorized' };

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

  const { data: ghost } = await supabase
    .from('organizations')
    .select('id, operational_settings')
    .eq('id', ghostOrgId)
    .eq('created_by_org_id', currentOrgId)
    .maybeSingle();

  if (!ghost) return { error: 'You do not have clearance to edit this entity.' };

  const existingOps = (ghost.operational_settings as Record<string, unknown>) ?? {};
  const ops: Record<string, unknown> = {
    ...existingOps,
    doing_business_as: doingBusinessAs ?? existingOps.doing_business_as ?? null,
    entity_type: entityType ?? existingOps.entity_type ?? null,
    tax_id: taxId ?? existingOps.tax_id ?? null,
    payment_terms: paymentTerms ?? existingOps.payment_terms ?? null,
    phone: phoneVal ?? existingOps.phone ?? null,
  };

  const { error } = await supabase
    .from('organizations')
    .update({
      name: name.trim(),
      website: website?.trim() || null,
      brand_color: brandColor?.trim() || null,
      logo_url: logoUrl?.trim() || null,
      support_email: supportEmail?.trim() || null,
      default_currency: defaultCurrency?.trim() || null,
      address: address ?? null,
      category: category as 'vendor' | 'venue' | 'coordinator' | 'client' | null,
      operational_settings: ops,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ghostOrgId);

  if (error) return { error: error.message };

  revalidatePath('/network');
  return { success: true };
}

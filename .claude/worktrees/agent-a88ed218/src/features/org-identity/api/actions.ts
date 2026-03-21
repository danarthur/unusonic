'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { updateOrg } from '@/features/org-management/api';

export type UpdateOrgIdentityResult = { ok: false; error: string } | { ok: true };

/**
 * Identity Architect – Commit & Return.
 * Updates org (name, description, brand_color, logo_url), revalidates layout so brand color
 * repaints globally, then redirects to /network.
 */
export async function updateOrgIdentity(
  _prevState: UpdateOrgIdentityResult | null,
  formData: FormData
): Promise<UpdateOrgIdentityResult> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: 'Unauthorized.' };

  const name = (formData.get('name') as string)?.trim();
  if (!name || name.length < 2) return { ok: false, error: 'Organization name must be at least 2 characters.' };

  const brandColor = (formData.get('brand_color') as string)?.trim() || null;
  const logoUrl = (formData.get('logo_url') as string)?.trim() || null;
  const description = (formData.get('description') as string)?.trim() || null;

  const result = await updateOrg({
    org_id: orgId,
    name,
    description: description || null,
    brand_color: brandColor || null,
    logo_url: logoUrl || null,
  });

  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath('/', 'layout');
  redirect('/network');
}

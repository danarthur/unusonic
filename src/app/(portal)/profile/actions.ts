'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

/** Employee self-service profile fields. Admin-controlled fields are excluded. */
const ALLOWED_FIELDS = new Set(['phone', 'emergency_contact', 'instagram']);

export async function updateMyProfile(
  entityId: string,
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  // Verify the entity belongs to the current user
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, claimed_by_user_id')
    .eq('id', entityId)
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();

  if (!entity) {
    return { ok: false, error: 'Not authorised.' };
  }

  // Filter to allowed fields only
  const safePatch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (ALLOWED_FIELDS.has(key)) {
      if (typeof value === 'string') {
        safePatch[key] = value.trim() || null;
      } else if (value && typeof value === 'object') {
        // Objects like emergency_contact: {name, phone}
        safePatch[key] = value;
      } else {
        safePatch[key] = null;
      }
    }
  }

  if (Object.keys(safePatch).length === 0) {
    return { ok: true }; // Nothing to update
  }

  const { error } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: safePatch,
  });

  if (error) {
    return { ok: false, error: 'Failed to update profile.' };
  }

  return { ok: true };
}

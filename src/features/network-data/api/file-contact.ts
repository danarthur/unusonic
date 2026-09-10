'use server';

/**
 * Saying what an unfiled contact is to you.
 *
 * The Unsorted section is where entities land with no role edge -- reached
 * through a deal, a capture, or an import, but never classified. It was a list
 * with no way out of it, so it could only grow.
 *
 * Filing one writes the role edge, which is the same thing summonPartner does
 * when a contact is added deliberately. cortex.relationships is SELECT-only by
 * RLS, so the write goes through upsert_relationship like every other edge
 * write.
 *
 * @module features/network-data/api/file-contact
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentEntityAndOrg } from './network-helpers';

/**
 * The roles an unfiled contact can be given.
 *
 * ROSTER_MEMBER is deliberately absent. It means employed staff, and the house
 * rule is that freelancers get PARTNER instead -- filing someone onto the
 * payroll from a dropdown is not a thing this control should be able to do.
 */
export type FileableRole = 'CLIENT' | 'VENDOR' | 'VENUE_PARTNER' | 'PARTNER';

const FILEABLE: readonly FileableRole[] = ['CLIENT', 'VENDOR', 'VENUE_PARTNER', 'PARTNER'];

export type FileContactResult = { ok: true } | { ok: false; error: string };

export async function fileContact(
  entityId: string,
  role: FileableRole,
): Promise<FileContactResult> {
  if (!FILEABLE.includes(role)) return { ok: false, error: 'Unknown role.' };

  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId) return { ok: false, error: 'Not authorized.' };

  const { data: orgEntity } = await supabase
    .schema('directory').from('entities')
    .select('id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();
  if (!orgEntity) return { ok: false, error: 'Workspace not found.' };

  // Confirm the entity is one of ours before pointing an edge at it. RLS would
  // refuse anyway, but failing here says why.
  const { data: target } = await supabase
    .schema('directory').from('entities')
    .select('id')
    .eq('id', entityId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'Contact not found.' };

  const { error } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: (orgEntity as { id: string }).id,
    p_target_entity_id: entityId,
    p_type: role,
    p_context_data: { tier: 'standard' },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/network');
  return { ok: true };
}

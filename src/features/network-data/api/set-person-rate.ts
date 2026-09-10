'use server';

/**
 * Setting what a person costs, from wherever you are looking at them.
 *
 * Rates were reachable only through the full-page form, so filling one in cost
 * a navigation away from whatever question prompted it. That is not a
 * willingness problem -- the number is known, it is the trip that is not worth
 * making -- and it is why most people in the directory have no rate on file.
 *
 * Deliberately the opposite of the capture path, which fills a rate only when
 * none exists so a misheard number cannot replace a real one. This IS the
 * deliberate edit that rule defers to.
 *
 * @module features/network-data/api/set-person-rate
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { PERSON_ATTR } from '@/entities/directory/model/attribute-keys';

export type SetPersonRateResult = { ok: true } | { ok: false; error: string };

/** Nobody's day rate is a million dollars, and nobody's is negative. */
const MAX_RATE = 1_000_000;

export async function setPersonRate(
  entityId: string,
  /** The amount, or null to clear it. */
  amount: number | null,
): Promise<SetPersonRateResult> {
  if (!entityId) return { ok: false, error: 'No contact given.' };

  if (amount !== null) {
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_RATE) {
      return { ok: false, error: 'That does not look like a rate.' };
    }
  }

  const supabase = await createClient();

  // RLS decides whether this is ours to change; reading first only lets us say
  // so plainly rather than failing silently on a merge into nothing.
  const { data: entity } = await supabase
    .schema('directory').from('entities')
    .select('id, type')
    .eq('id', entityId)
    .maybeSingle();
  if (!entity) return { ok: false, error: 'Contact not found.' };

  const type = (entity as { type: string | null }).type;
  if (type !== 'person' && type !== 'couple') {
    return { ok: false, error: 'Only people have a rate.' };
  }

  const { error } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    // A merge, so clearing has to write the null rather than omit the key.
    p_attributes: { [PERSON_ATTR.rate_amount]: amount === null ? null : Math.round(amount) },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/network');
  revalidatePath(`/network/entity/${entityId}`);
  return { ok: true };
}

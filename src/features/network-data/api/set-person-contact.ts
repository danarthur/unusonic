'use server';

/**
 * Correcting a phone number or an email, from wherever you noticed it was wrong.
 *
 * The same argument as [[set-person-rate]]: these are one-field corrections,
 * and routing them through the full-page form means most of them never happen.
 * A directory whose small fixes cost a navigation is a directory that drifts
 * out of date one wrong number at a time.
 *
 * Deliberately narrow. It writes one field, on a person, and nothing else --
 * `updatePreferredPerson` needs the whole profile and would blank whatever the
 * caller did not send.
 *
 * @module features/network-data/api/set-person-contact
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { PERSON_ATTR } from '@/entities/directory/model/attribute-keys';

export type SetPersonContactResult = { ok: true } | { ok: false; error: string };

export type PersonContactField = 'phone' | 'email';

/** Long enough for an international number with punctuation, short enough to be one. */
const MAX_PHONE = 32;
const MAX_EMAIL = 320;

/**
 * Deliberately permissive. A phone number is a human-entered string -- people
 * keep extensions, country codes and notes in them -- so this rejects only what
 * cannot be a number at all rather than imposing a format nobody agreed to.
 */
function validate(field: PersonContactField, value: string): string | null {
  if (field === 'phone') {
    if (value.length > MAX_PHONE) return 'That phone number is too long.';
    if (!/\d/.test(value)) return 'A phone number needs at least one digit.';
    return null;
  }
  if (value.length > MAX_EMAIL) return 'That email address is too long.';
  // One @, something either side, and a dot in the domain. Anything stricter
  // rejects addresses that genuinely deliver.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'That does not look like an email address.';
  return null;
}

/** Everything that can be decided without touching the database. */
function check(
  entityId: string,
  field: PersonContactField,
  value: string | null,
): { error: string } | { next: string | null } {
  if (!entityId) return { error: 'No contact given.' };
  if (field !== 'phone' && field !== 'email') return { error: 'Unknown field.' };

  const trimmed = value?.trim() ?? '';
  const next = trimmed === '' ? null : trimmed;
  if (next !== null) {
    const problem = validate(field, next);
    if (problem) return { error: problem };
  }
  return { next };
}

export async function setPersonContact(
  entityId: string,
  field: PersonContactField,
  /** The new value, or null to clear it. */
  value: string | null,
): Promise<SetPersonContactResult> {
  const checked = check(entityId, field, value);
  if ('error' in checked) return { ok: false, error: checked.error };
  const { next } = checked;

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
    return { ok: false, error: 'Only people have a personal phone or email.' };
  }

  const key = field === 'phone' ? PERSON_ATTR.phone : PERSON_ATTR.email;
  const { error } = await supabase.schema('directory').rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    // A merge, so clearing has to write the null rather than omit the key.
    p_attributes: { [key]: next },
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/network');
  revalidatePath(`/network/entity/${entityId}`);
  return { ok: true };
}

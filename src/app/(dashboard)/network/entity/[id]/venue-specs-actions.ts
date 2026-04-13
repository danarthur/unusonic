'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { VENUE_ATTR } from '@/entities/directory/model/attribute-keys';

/** Set of valid venue attribute keys for validation. */
const VALID_VENUE_KEYS = new Set<string>(Object.values(VENUE_ATTR));

type PatchResult = { ok: true } | { ok: false; error: string };

/**
 * Patches a single venue attribute via the patch_entity_attributes RPC.
 * Uses the session client (RLS-enforced) — no system client.
 *
 * Validates the key against VENUE_ATTR constants to prevent arbitrary writes.
 */
export async function patchVenueAttribute(
  entityId: string,
  key: string,
  value: string | number | boolean | null,
): Promise<PatchResult> {
  if (!entityId) return { ok: false, error: 'Missing entity ID.' };
  if (!VALID_VENUE_KEYS.has(key)) return { ok: false, error: `Invalid venue attribute key: ${key}` };

  const supabase = await createClient();
  const { error } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: { [key]: value },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

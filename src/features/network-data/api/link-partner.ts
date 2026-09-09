'use server';

/**
 * Adding the second person, whether or not they already exist.
 *
 * One control, two jobs -- because the alternative is what every product that
 * split them ended up with. Dubsado's answer to a second person who already has
 * a record is to "add their contact information as a new client entry", which
 * is an instruction to re-type a human you already have. NPSP's household merge
 * exists precisely to clean that up afterwards, and its shipped duplicate rules
 * match the same person twice, not two people in one household -- nobody ships
 * household detection, so nobody is going to catch this for you later.
 *
 * So: search first, create only when nothing matches. The duplicate is prevented
 * at the moment it would be made, which is the only moment it is cheap.
 *
 * @module features/network-data/api/link-partner
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { summonPersonGhost } from './ghost-actions';

export type LinkablePerson = {
  entityId: string;
  name: string;
  avatarUrl: string | null;
  /** What they already are to us, so you can tell two Jane Okafors apart. */
  subtitle: string | null;
};

export type LinkPartnerResult =
  | { ok: true; entityId: string }
  | { ok: false; error: string };

const PAIRINGS = ['romantic', 'co_host', 'family'] as const;
export type Pairing = (typeof PAIRINGS)[number];

/**
 * People in this workspace who could be the other half, minus the person you
 * are looking at and anyone already linked to them.
 */
export async function searchLinkablePeople(
  query: string,
  excludeEntityId: string,
): Promise<LinkablePerson[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();

  const { data: rows } = await supabase
    .schema('directory').from('entities')
    .select('id, display_name, avatar_url, attributes')
    .eq('type', 'person')
    .neq('id', excludeEntityId)
    .ilike('display_name', `%${trimmed}%`)
    .limit(8);
  if (!rows || rows.length === 0) return [];

  // Already linked is not a candidate -- offering it would write an edge that
  // is already there and read as a no-op the user cannot explain.
  const { data: existing } = await supabase
    .schema('cortex').from('relationships')
    .select('target_entity_id')
    .eq('source_entity_id', excludeEntityId)
    .eq('relationship_type', 'CO_HOST');
  const linked = new Set((existing ?? []).map((e) => e.target_entity_id));

  return rows
    .filter((r) => !linked.has(r.id))
    .map((r) => {
      // Parsed, not raw. The key name lives in attribute-keys.ts, and reading
      // it off the JSONB directly would silently return undefined if it moved.
      const individual = readEntityAttrs(r.attributes, 'individual');
      const category = individual.category ?? null;
      return {
        entityId: r.id,
        name: r.display_name ?? 'Unnamed',
        avatarUrl: r.avatar_url ?? null,
        subtitle: category ? category.charAt(0).toUpperCase() + category.slice(1) : null,
      };
    });
}

/**
 * Link two people. `partner` is either an existing entity id or a name to
 * summon, never both -- the caller has already chosen which.
 */
export async function linkPartner(
  entityId: string,
  partner: { existingEntityId: string } | { name: string },
  pairing: Pairing,
  sourceOrgId: string,
): Promise<LinkPartnerResult> {
  if (!entityId) return { ok: false, error: 'No contact given.' };
  if (!PAIRINGS.includes(pairing)) return { ok: false, error: 'Unknown pairing.' };

  let partnerEntityId: string;
  if ('existingEntityId' in partner) {
    partnerEntityId = partner.existingEntityId;
  } else {
    const name = partner.name.trim();
    if (!name) return { ok: false, error: 'Give them a name.' };
    // The same edge the show flow writes for a new host, so a partner added
    // here is indistinguishable from one added by booking a show.
    const summoned = await summonPersonGhost(sourceOrgId, name, 'client');
    if (!summoned.ok) return { ok: false, error: summoned.error };
    partnerEntityId = summoned.entityId;
  }

  if (partnerEntityId === entityId) return { ok: false, error: 'That is the same person.' };

  const supabase = await createClient();
  const { data: entity } = await supabase
    .schema('directory').from('entities')
    .select('owner_workspace_id')
    .eq('id', entityId)
    .maybeSingle();
  if (!entity?.owner_workspace_id) return { ok: false, error: 'Contact not found.' };

  // Writes both directions and validates workspace ownership of both halves.
  const { error } = await supabase.rpc('add_co_host_edge', {
    p_workspace_id: entity.owner_workspace_id,
    p_partner_a_id: entityId,
    p_partner_b_id: partnerEntityId,
    p_pairing: pairing,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/network');
  revalidatePath(`/network/entity/${entityId}`);
  revalidatePath(`/network/entity/${partnerEntityId}`);
  return { ok: true, entityId: partnerEntityId };
}

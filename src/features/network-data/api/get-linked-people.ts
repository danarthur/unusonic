'use server';

/**
 * Who else is on this record.
 *
 * A couple books a show and `create_deal_complete` writes a `CO_HOST` edge in
 * both directions, carrying the pairing and the anniversary. Two partners, two
 * real person entities, one typed edge joining them -- and until now nothing
 * anywhere read it. Unusonic knew who the second person was from the moment the
 * show was created and had never once shown you.
 *
 * The edge is written bidirectionally, so selecting on `source_entity_id`
 * returns each partner exactly once. No dedupe needed, and no union of two
 * queries.
 *
 * Deliberately not a "couple" reader. `CO_HOST` already spans romantic
 * partners, co-hosts and family, and the same shape will serve REPRESENTS and
 * BOOKS_FOR when those get read too -- there is a whole relationship vocabulary
 * being written and never displayed.
 *
 * Design: docs/couples-and-linked-people.md §C1.
 *
 * @module features/network-data/api/get-linked-people
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type LinkedPairing = 'romantic' | 'co_host' | 'family';

export type LinkedPerson = {
  entityId: string;
  name: string;
  avatarUrl: string | null;
  pairing: LinkedPairing;
  /** Only set for romantic pairs, and only when someone entered one. */
  anniversary: string | null;
  /**
   * Absent in the stored context means current -- every edge written before
   * the status existed reads that way, which is why there was no backfill.
   * A former pair is shown, never hidden: the show still happened.
   */
  status: 'current' | 'former';
  endedOn: string | null;
};

const PAIRINGS: LinkedPairing[] = ['romantic', 'co_host', 'family'];

function readPairing(context: unknown): LinkedPairing {
  const raw = (context as { pairing?: unknown } | null)?.pairing;
  return PAIRINGS.includes(raw as LinkedPairing) ? (raw as LinkedPairing) : 'co_host';
}

export async function getLinkedPeople(entityId: string): Promise<LinkedPerson[]> {
  if (!entityId) return [];

  const supabase = await createClient();

  // RLS on cortex.relationships is SELECT-only and scoped through the source
  // entity's workspace, so this needs no membership check of its own.
  const { data: edges } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('target_entity_id, context_data')
    .eq('source_entity_id', entityId)
    .eq('relationship_type', 'CO_HOST');

  if (!edges || edges.length === 0) return [];

  const targetIds = edges.map((e) => e.target_entity_id).filter(Boolean) as string[];
  if (targetIds.length === 0) return [];

  const { data: people } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, avatar_url')
    .in('id', targetIds);

  const byId = new Map((people ?? []).map((p) => [p.id, p]));

  return edges.flatMap((edge) => {
    const person = byId.get(edge.target_entity_id as string);
    // An edge pointing at an entity we cannot read is not worth a broken chip.
    if (!person) return [];
    const context = edge.context_data as
      { anniversary_date?: unknown; status?: unknown; ended_on?: unknown } | null;
    const anniversary =
      typeof context?.anniversary_date === 'string' ? context.anniversary_date : null;
    return [{
      entityId: person.id,
      name: person.display_name ?? 'Unnamed',
      avatarUrl: person.avatar_url ?? null,
      pairing: readPairing(edge.context_data),
      anniversary,
      status: context?.status === 'former' ? 'former' : 'current',
      endedOn: typeof context?.ended_on === 'string' ? context.ended_on : null,
    }];
  });
}

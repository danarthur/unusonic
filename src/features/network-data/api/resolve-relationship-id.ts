'use server';

/**
 * An entity id is not a relationship id, and half the app only has the former.
 *
 * `/network/entity/[id]` is built around `getNetworkNodeDetails`, which takes a
 * `cortex.relationships.id`. Anything that knows a person only as a
 * `directory.entities` row -- a partner chip, a company's crew tab, an
 * "about X" capture chip -- passes an entity id, misses, and lands on the
 * read-first fallback: the same person with most of their record missing.
 *
 * That fallback is a genuine last resort for an entity with no edge at all. It
 * should not be where you land on someone you have a relationship with, which
 * is what happens today. So: look the edge up first, fall back only when there
 * really isn't one.
 *
 * Scoped to the caller's own org entity, not just the workspace. A workspace
 * can hold more than one org, and picking any edge to the person could hand
 * back another org's relationship.
 *
 * @module features/network-data/api/resolve-relationship-id
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type ResolvedNode = {
  relationshipId: string;
  kind: 'internal_employee' | 'external_partner';
};

const PARTNER_TYPES = ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER'];

export async function resolveRelationshipId(
  entityId: string,
  sourceOrgId: string,
): Promise<ResolvedNode | null> {
  if (!entityId || !sourceOrgId) return null;

  const supabase = await createClient();

  const { data: srcEnt } = await supabase
    .schema('directory').from('entities')
    .select('id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  if (!srcEnt?.id) return null;

  // Partner edges point org -> person/company.
  const { data: partnerEdges } = await supabase
    .schema('cortex').from('relationships')
    .select('id, context_data')
    .eq('source_entity_id', srcEnt.id)
    .eq('target_entity_id', entityId)
    .in('relationship_type', PARTNER_TYPES)
    .limit(10);

  // A soft-deleted connection is still a row. Landing on it would show a
  // record the network list has already stopped offering.
  const live = (partnerEdges ?? []).find(
    (e) => !(e.context_data as { deleted_at?: unknown } | null)?.deleted_at,
  );
  if (live) return { relationshipId: live.id, kind: 'external_partner' };

  // Roster edges point person -> org, the other way round.
  const { data: rosterEdge } = await supabase
    .schema('cortex').from('relationships')
    .select('id')
    .eq('source_entity_id', entityId)
    .eq('target_entity_id', srcEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();
  if (rosterEdge?.id) return { relationshipId: rosterEdge.id, kind: 'internal_employee' };

  return null;
}

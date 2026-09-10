'use server';

/**
 * Every role a contact holds with us, not just the one you arrived through.
 *
 * A freelance DJ is crew when you book him for a show and a payee when you cut
 * the cheque. Both are true, the industry itself is split on which to file him
 * under — QuickBooks says vendor, LASSO and Rentman say crew — and the criterion
 * both sides actually share is the engagement, not the person.
 *
 * `cortex.relationships` has always allowed him to hold both. `fileContact`
 * has always been able to add one. The only place that offer appeared was the
 * Unsorted lane, so a contact who already had a role could never gain a second
 * — and a person missing from where someone looks reads as absent from the
 * system entirely, which is how duplicates get made.
 *
 * Soft-deleted edges are excluded: a connection in its restore window is not a
 * role someone currently holds.
 *
 * Design: docs/roster-vendors-and-the-word-crew.md §R3.
 *
 * @module features/network-data/api/get-entity-roles
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { FileableRole } from './file-contact';

const ROLE_TYPES: readonly FileableRole[] = ['CLIENT', 'VENDOR', 'VENUE_PARTNER', 'PARTNER'];

export async function getEntityRoles(entityId: string): Promise<FileableRole[]> {
  if (!entityId) return [];

  const supabase = await createClient();

  const { data: srcEnt } = await supabase
    .schema('directory').from('entities')
    .select('id, legacy_org_id')
    .eq('id', entityId)
    .maybeSingle();
  if (!srcEnt) return [];

  // Roles are edges from OUR org to them. RLS scopes the read to workspaces the
  // caller belongs to, so this cannot see another company's filing.
  const { data: edges } = await supabase
    .schema('cortex').from('relationships')
    .select('relationship_type, context_data')
    .eq('target_entity_id', entityId)
    .in('relationship_type', [...ROLE_TYPES]);

  const held = new Set<FileableRole>();
  for (const edge of edges ?? []) {
    if ((edge.context_data as { deleted_at?: unknown } | null)?.deleted_at) continue;
    held.add(edge.relationship_type as FileableRole);
  }

  // Stable order, so the chips do not reshuffle between reads.
  return ROLE_TYPES.filter((role) => held.has(role));
}

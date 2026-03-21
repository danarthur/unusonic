'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { RelationshipType } from '../model/types';

export type CreateOrgRelationshipResult = { ok: true; id: string } | { ok: false; error: string };

/** Maps RelationshipType to cortex relationship_type. */
function relTypeToCortexType(type: RelationshipType | string): string {
  switch (type) {
    case 'vendor':         return 'VENDOR';
    case 'venue':          return 'VENUE_PARTNER';
    case 'client_company': return 'CLIENT';
    case 'partner':        return 'PARTNER';
    default:               return String(type).toUpperCase();
  }
}

/**
 * Link source_org to target_org (vendor/venue/client/partner).
 * Writes to cortex.relationships via upsert_relationship RPC.
 * Accepts both entity UUIDs and legacy_org_ids.
 */
export async function createOrgRelationship(
  sourceOrgId: string,
  targetOrgId: string,
  type: RelationshipType,
  notes?: string | null
): Promise<CreateOrgRelationshipResult> {
  const supabase = await createClient();

  // Resolve both entities — accept direct entity UUID or legacy_org_id
  const [sourceRes, targetRes] = await Promise.all([
    supabase.schema('directory').from('entities').select('id').or(`id.eq.${sourceOrgId},legacy_org_id.eq.${sourceOrgId}`).maybeSingle(),
    supabase.schema('directory').from('entities').select('id').or(`id.eq.${targetOrgId},legacy_org_id.eq.${targetOrgId}`).maybeSingle(),
  ]);

  if (!sourceRes.data?.id) return { ok: false, error: 'Source organization not found.' };
  if (!targetRes.data?.id) return { ok: false, error: 'Target organization not found.' };

  const { data, error } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: sourceRes.data.id,
    p_target_entity_id: targetRes.data.id,
    p_type: relTypeToCortexType(type),
    p_context_data: {
      notes: notes ?? null,
      tier: 'standard',
    },
  });

  if (error) return { ok: false, error: error.message };

  return { ok: true, id: (data as string) ?? sourceRes.data.id };
}

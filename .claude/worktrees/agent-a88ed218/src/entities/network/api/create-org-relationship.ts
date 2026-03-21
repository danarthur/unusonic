'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { RelationshipType } from '../model/types';

export type CreateOrgRelationshipResult = { ok: true; id: string } | { ok: false; error: string };

/** Maps RelationshipType to cortex relationship_type. */
function relTypeToCortexType(type: RelationshipType | string): string {
  switch (type) {
    case 'vendor':       return 'VENDOR';
    case 'venue':        return 'VENUE_PARTNER';
    case 'client_company': return 'CLIENT';
    case 'partner':      return 'PARTNER';
    default:             return String(type).toUpperCase();
  }
}

/**
 * Link source_org to target_org (vendor/venue/client/partner).
 * Dual-write: inserts into org_relationships (primary) and cortex.relationships (new schema).
 * RLS: only source_org members can insert.
 * workspace_id is resolved from source org for tenant isolation.
 */
export async function createOrgRelationship(
  sourceOrgId: string,
  targetOrgId: string,
  type: RelationshipType,
  notes?: string | null
): Promise<CreateOrgRelationshipResult> {
  const supabase = await createClient();

  const { data: org } = await supabase
    .from('organizations')
    .select('workspace_id')
    .eq('id', sourceOrgId)
    .single();
  if (!org?.workspace_id) return { ok: false, error: 'Organization not found.' };

  const { data, error } = await supabase
    .from('org_relationships')
    .insert({
      source_org_id: sourceOrgId,
      target_org_id: targetOrgId,
      type,
      notes: notes ?? null,
      workspace_id: org.workspace_id,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };

  // Dual-write: mirror to cortex.relationships (new schema)
  const [sourceRes, targetRes] = await Promise.all([
    supabase.schema('directory').from('entities').select('id').eq('legacy_org_id', sourceOrgId).maybeSingle(),
    supabase.schema('directory').from('entities').select('id').eq('legacy_org_id', targetOrgId).maybeSingle(),
  ]);
  if (sourceRes.data?.id && targetRes.data?.id) {
    await supabase.rpc('upsert_relationship', {
      p_source_entity_id: sourceRes.data.id,
      p_target_entity_id: targetRes.data.id,
      p_type: relTypeToCortexType(type),
      p_context_data: {
        notes: notes ?? null,
        tier: 'standard',
        legacy_org_relationship_id: data.id,
      },
    });
  }
  // Non-fatal: cortex mirror failure doesn't block the primary write.

  return { ok: true, id: data.id };
}

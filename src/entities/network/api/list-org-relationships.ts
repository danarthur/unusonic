'use server';
 

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { OrgConnectionItem, RelationshipType } from '../model/types';

/** Maps cortex relationship_type back to the legacy RelationshipType enum. */
function cortexTypeToRelType(cortexType: string): RelationshipType {
  switch (cortexType) {
    case 'VENDOR':       return 'vendor';
    case 'VENUE_PARTNER': return 'venue';
    case 'CLIENT':       return 'client_company';
    case 'PARTNER':      return 'partner';
    default:             return 'partner';
  }
}

/** List cortex relationships for a source org (my Rolodex). */
export async function listOrgRelationships(sourceOrgId: string): Promise<OrgConnectionItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Resolve source entity — workspace-scoped; accepts direct entity UUID or legacy_org_id
  const { data: sourceEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .or(`id.eq.${sourceOrgId},legacy_org_id.eq.${sourceOrgId}`)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (sourceEntity) {
    const { data: cortexRels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('id, target_entity_id, relationship_type, context_data, created_at')
      .eq('source_entity_id', sourceEntity.id)
      .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER']);

    if (cortexRels?.length) {
      const targetEntityIds = [...new Set(cortexRels.map((r) => r.target_entity_id))];
      const { data: targetEntities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, attributes, legacy_org_id')
        .in('id', targetEntityIds);

      const entityMap = new Map((targetEntities ?? []).map((e) => [e.id, e]));

      return cortexRels.map((r): OrgConnectionItem => {
        const target = entityMap.get(r.target_entity_id);
        const ctx = (r.context_data as Record<string, unknown>) ?? {};
        const attrs = (target?.attributes as Record<string, unknown>) ?? {};
        // Use legacy_org_relationship_id as id for backward-compat with UPDATE callers
        const id = (ctx.legacy_org_relationship_id as string | null) ?? r.id;
        const targetOrgId = (target?.legacy_org_id as string | null) ?? r.target_entity_id;
        return {
          id,
          source_org_id: sourceOrgId,
          target_org_id: targetOrgId,
          type: cortexTypeToRelType(r.relationship_type),
          notes: (ctx.notes as string | null) ?? null,
          created_at: r.created_at ?? new Date().toISOString(),
          target_org: target
            ? {
                id: targetOrgId,
                name: target.display_name,
                is_ghost: (attrs.is_ghost as boolean) ?? false,
                address: (attrs.address as { city?: string; state?: string } | null) ?? null,
              }
            : { id: r.target_entity_id, name: 'Unknown', is_ghost: false, address: null },
        };
      });
    }
  }

  return [];
}

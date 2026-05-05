/**
 * Network Orbit – searchNetworkOrgs: OmniSearch over connections + global directory.
 * @module features/network-data/api/network-read-actions/search
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentEntityAndOrg } from '../network-helpers';
import type { NetworkSearchOrg } from './types';

/**
 * Search two universes for OmniSearch: Your connections first, then global public directory.
 * Prevents creating duplicate ghosts (e.g. "Acme Catering" already in rolodex).
 * RLS: user must belong to sourceOrg.
 */
export async function searchNetworkOrgs(
  sourceOrgId: string,
  query: string,
  options?: { entityType?: string }
): Promise<NetworkSearchOrg[]> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return [];

  const q = query.trim();
  if (q.length < 1) return [];

  // Prefer directory.entities for workspace lookup
  const { data: srcEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id')
    .eq('legacy_org_id', sourceOrgId)
    .maybeSingle();
  const workspaceId: string | null = srcEntity?.owner_workspace_id ?? null;
  let connectionResults: NetworkSearchOrg[] = [];
  let connectionIds: string[] = [];

  if (srcEntity?.id && workspaceId) {
    // CORTEX PATH: get my active connection target entity IDs
    // NOTE: ROSTER_MEMBER is intentionally excluded from this filter.
    // Crew-specific search (which surfaces internal team members) should use
    // searchCrewMembers() from src/app/(dashboard)/(features)/events/actions/deal-crew.ts instead.
    const { data: cortexRels } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('target_entity_id, context_data')
      .eq('source_entity_id', srcEntity.id)
      .in('relationship_type', ['VENDOR', 'VENUE_PARTNER', 'CLIENT', 'PARTNER']);

    const activeTargetIds = (cortexRels ?? [])
      .filter((r) => !(r.context_data as Record<string, unknown>)?.deleted_at)
      .map((r) => r.target_entity_id);

    if (activeTargetIds.length > 0) {
      const connQ = supabase
        .schema('directory')
        .from('entities')
        .select('id, type, display_name, avatar_url, attributes, legacy_org_id')
        .in('id', activeTargetIds)
        .ilike('display_name', `%${q}%`);
      const { data: targetEntities } = await (options?.entityType
        ? connQ.eq('type', options.entityType)
        : connQ
      ).limit(10);

      connectionResults = (targetEntities ?? []).map((e) => {
        const attrs = (e.attributes as Record<string, unknown>) ?? {};
        const legacyId = (e.legacy_org_id as string | null) ?? e.id;
        const first = (attrs.first_name as string | undefined) ?? '';
        const last = (attrs.last_name as string | undefined) ?? '';
        const constructed = [first, last].filter(Boolean).join(' ').trim();
        return {
          id: legacyId,
          entity_uuid: e.id,
          name: constructed || e.display_name,
          logo_url: (e.avatar_url as string | null) ?? null,
          is_ghost: (attrs.is_ghost as boolean) ?? false,
          entity_type: (e.type as string) ?? null,
          _source: 'connection' as const,
        };
      });
    }
    connectionIds = connectionResults.map((r) => r.id);
  }

  if (!workspaceId) return connectionResults;

  const excludeSet = new Set([sourceOrgId, ...connectionIds]);

  // 2. GLOBAL DIRECTORY — preferred: directory.entities; fallback: organizations
  let globalResults: NetworkSearchOrg[] = [];
  const globalQ = supabase
    .schema('directory')
    .from('entities')
    .select('id, type, display_name, avatar_url, attributes, legacy_org_id')
    .eq('owner_workspace_id', workspaceId)
    .ilike('display_name', `%${q}%`);
  const { data: globalEntities } = await (options?.entityType
    ? globalQ.eq('type', options.entityType)
    : globalQ
  ).limit(15);

  if (globalEntities?.length) {
    const globalFiltered = globalEntities
      .filter((e) => {
        const attrs = (e.attributes as Record<string, unknown>) ?? {};
        const isGhost = (attrs.is_ghost as boolean) ?? false;
        const eid = (e.legacy_org_id as string | null) ?? e.id;
        return !isGhost && !excludeSet.has(eid);
      })
      .slice(0, 10);
    globalResults = globalFiltered.map((e) => {
      const attrs = (e.attributes as Record<string, unknown>) ?? {};
      const eid = (e.legacy_org_id as string | null) ?? e.id;
      const first = (attrs.first_name as string | undefined) ?? '';
      const last = (attrs.last_name as string | undefined) ?? '';
      const constructed = [first, last].filter(Boolean).join(' ').trim();
      return {
        id: eid,
        entity_uuid: e.id,
        name: constructed || e.display_name,
        logo_url: (e.avatar_url as string | null) ?? null,
        is_ghost: (attrs.is_ghost as boolean) ?? false,
        entity_type: (e.type as string) ?? null,
        _source: 'global' as const,
      };
    });
  }

  return [...connectionResults, ...globalResults];
}

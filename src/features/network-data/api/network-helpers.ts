/**
 * Network Orbit – Shared helpers used across network action files.
 * @module features/network-data/api/network-helpers
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2, restricted: 3 };

/** HQ org resolution: uses cortex.relationships ROSTER_MEMBER/MEMBER edges. */
export const ORG_ROLE_PRIORITY: Record<string, number> = {
  owner: 0,
  admin: 1,
  manager: 2,
  member: 3,
  restricted: 4,
};

/** Maps relationship type string to cortex relationship_type. */
export function orgTypeToCortex(type: string): string {
  switch (type) {
    case 'vendor':         return 'VENDOR';
    case 'venue':          return 'VENUE_PARTNER';
    case 'client_company': return 'CLIENT';
    case 'client':         return 'CLIENT';
    case 'partner':        return 'PARTNER';
    default:               return type.toUpperCase();
  }
}

/**
 * Resolve current user's entity id and HQ org via directory.entities + cortex.relationships.
 * Session 9: migrated from public.entities + public.org_members.
 * Returns: entityId = directory.entities.id, orgId = legacy_org_id UUID.
 */
export async function getCurrentEntityAndOrg(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { entityId: null, orgId: null };

  const { data: personEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
  if (!personEnt) return { entityId: null, orgId: null };

  const { data: rels } = await supabase
    .schema('cortex').from('relationships')
    .select('target_entity_id, context_data')
    .eq('source_entity_id', personEnt.id)
    .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
    .limit(5);

  if (rels?.length) {
    const sorted = [...rels].sort((a, b) => {
      const ra = (a.context_data as Record<string, unknown>)?.role as string ?? '';
      const rb = (b.context_data as Record<string, unknown>)?.role as string ?? '';
      return (ORG_ROLE_PRIORITY[ra] ?? 99) - (ORG_ROLE_PRIORITY[rb] ?? 99);
    });
    const { data: orgEnt } = await supabase
      .schema('directory').from('entities')
      .select('legacy_org_id').eq('id', sorted[0].target_entity_id).maybeSingle();
    return { entityId: personEnt.id, orgId: orgEnt?.legacy_org_id ?? null };
  }

  return { entityId: personEnt.id, orgId: null };
}

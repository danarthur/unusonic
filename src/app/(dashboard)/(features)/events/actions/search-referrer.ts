'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { searchNetworkOrgs } from '@/features/network-data/api/network-read-actions';
import { searchCrewMembers } from './deal-crew';

// -----------------------------------------------------------------------------
// searchReferrerEntities: Smart referrer search across the full network.
//
// Four search paths run in parallel:
//   1. Your own team (ROSTER_MEMBER of your org)
//   2. Network connections (companies, venues, partners)
//   3. All workspace person entities (catches employees of network companies)
//   4. Employees of companies matching the query (search "Pure Lavish" →
//      shows the company AND expands Alexa, Gia underneath)
//
// Person results include their company affiliation as a subtitle.
// -----------------------------------------------------------------------------

export type ReferrerSearchResult = {
  id: string;
  name: string;
  /** Company or org the person belongs to, if any */
  subtitle: string | null;
  section: 'team' | 'network';
};

export async function searchReferrerEntities(query: string): Promise<ReferrerSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const [sourceOrgId, workspaceId] = await Promise.all([
      getCurrentOrgId(),
      getActiveWorkspaceId(),
    ]);
    if (!sourceOrgId || !workspaceId) return [];

    const supabase = await createClient();

    // Run all searches in parallel
    const [net, crew, people, companyMatches] = await Promise.all([
      searchNetworkOrgs(sourceOrgId, trimmed),
      searchCrewMembers(sourceOrgId, trimmed),
      // All person entities in the workspace matching the query
      supabase
        .schema('directory')
        .from('entities')
        .select('id, type, display_name, attributes')
        .eq('owner_workspace_id', workspaceId)
        .eq('type', 'person')
        .ilike('display_name', `%${trimmed}%`)
        .limit(10)
        .then(({ data }) => data ?? []),
      // Companies matching the query — we'll expand their employees
      supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .eq('owner_workspace_id', workspaceId)
        .in('type', ['company', 'venue'])
        .ilike('display_name', `%${trimmed}%`)
        .limit(5)
        .then(({ data }) => data ?? []),
    ]);

    // For matched companies, fetch their employees via ROSTER_MEMBER edges
    const companyEmployees: { id: string; name: string; companyName: string }[] = [];
    const matchedCompanyIds = companyMatches.map((c) => c.id);
    if (matchedCompanyIds.length > 0) {
      const { data: rosterEdges } = await supabase
        .schema('cortex')
        .from('relationships')
        .select('source_entity_id, target_entity_id, context_data')
        .in('target_entity_id', matchedCompanyIds)
        .eq('relationship_type', 'ROSTER_MEMBER');

      if (rosterEdges?.length) {
        const personIds = [...new Set((rosterEdges as { source_entity_id: string }[]).map((r) => r.source_entity_id))];
        const { data: personEntities } = await supabase
          .schema('directory')
          .from('entities')
          .select('id, display_name, attributes')
          .in('id', personIds);

        const companyNameMap = new Map(companyMatches.map((c) => [c.id, c.display_name as string]));
        const personMap = new Map((personEntities ?? []).map((e) => [e.id, e]));

        for (const edge of (rosterEdges as { source_entity_id: string; target_entity_id: string; context_data: unknown }[])) {
          const person = personMap.get(edge.source_entity_id);
          if (!person) continue;
          const ctx = (edge.context_data as Record<string, unknown>) ?? {};
          if (ctx.deleted_at || ctx.archived) continue;
          const attrs = (person.attributes as Record<string, unknown>) ?? {};
          const first = (attrs.first_name as string) ?? '';
          const last = (attrs.last_name as string) ?? '';
          const name = [first, last].filter(Boolean).join(' ').trim() || (person.display_name as string) || '';
          if (!name) continue;
          companyEmployees.push({
            id: person.id,
            name,
            companyName: companyNameMap.get(edge.target_entity_id) ?? '',
          });
        }
      }
    }

    // For person results, resolve their company affiliation
    const personIds = people.map((p) => p.id);
    const personCompanyMap = new Map<string, string>();
    if (personIds.length > 0) {
      const { data: affiliations } = await supabase
        .schema('cortex')
        .from('relationships')
        .select('source_entity_id, target_entity_id')
        .in('source_entity_id', personIds)
        .eq('relationship_type', 'ROSTER_MEMBER');

      if (affiliations?.length) {
        const companyIds = [...new Set((affiliations as { target_entity_id: string }[]).map((a) => a.target_entity_id))];
        const { data: companies } = await supabase
          .schema('directory')
          .from('entities')
          .select('id, display_name')
          .in('id', companyIds);

        const cMap = new Map((companies ?? []).map((c) => [c.id, c.display_name as string]));
        for (const a of (affiliations as { source_entity_id: string; target_entity_id: string }[])) {
          const companyName = cMap.get(a.target_entity_id);
          if (companyName) personCompanyMap.set(a.source_entity_id, companyName);
        }
      }
    }

    // Build deduplicated output
    const seen = new Set<string>();
    const out: ReferrerSearchResult[] = [];

    // 1. Your team
    for (const r of crew) {
      if (seen.has(r.entity_id)) continue;
      seen.add(r.entity_id);
      out.push({ id: r.entity_id, name: r.name, subtitle: null, section: 'team' });
    }

    // 2. Network connections (companies, venues, partners)
    for (const r of net) {
      const eid = r.entity_uuid ?? r.id;
      if (seen.has(eid)) continue;
      seen.add(eid);
      out.push({ id: eid, name: r.name, subtitle: r.entity_type ?? null, section: 'network' });
    }

    // 3. Employees of matched companies (expanded under the company)
    for (const emp of companyEmployees) {
      if (seen.has(emp.id)) continue;
      seen.add(emp.id);
      out.push({ id: emp.id, name: emp.name, subtitle: emp.companyName, section: 'network' });
    }

    // 4. Person entities with company affiliation
    for (const e of people) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const attrs = (e.attributes as Record<string, unknown>) ?? {};
      const first = (attrs.first_name as string) ?? '';
      const last = (attrs.last_name as string) ?? '';
      const name = [first, last].filter(Boolean).join(' ').trim() || (e.display_name as string) || '';
      if (!name) continue;
      out.push({ id: e.id, name, subtitle: personCompanyMap.get(e.id) ?? null, section: 'network' });
    }

    return out;
  } catch {
    return [];
  }
}

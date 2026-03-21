'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getCurrentOrgId } from '@/features/network/api/actions';

export type PreferredCrewMember = {
  entityId: string;
  relationshipId: string;
  name: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  lastAssignedAt: string | null; // ISO string of most recent confirmed/dispatched assignment
  assignmentCount: number;
};

/**
 * Returns roster members ordered by most recent confirmed/dispatched assignment date.
 * Optionally filters by roleFilter (matched against job_title in context_data, case-insensitive).
 * Used to populate the top section of AssignCrewSheet without any label or badge.
 */
export async function getPreferredCrewForPicker(
  roleFilter?: string
): Promise<PreferredCrewMember[]> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return [];

  const supabase = await createClient();

  // Resolve the directory entity for this org (include owner_workspace_id to avoid a second round-trip)
  const { data: orgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();

  if (!orgEnt) return [];

  // Fetch all ROSTER_MEMBER edges targeting this org
  const { data: rosterEdges } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, context_data')
    .eq('target_entity_id', orgEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER');

  if (!rosterEdges || rosterEdges.length === 0) return [];

  // Apply optional role filter against context_data.job_title
  const roleLower = roleFilter?.trim().toLowerCase();
  const filtered = roleLower
    ? rosterEdges.filter((edge) => {
        const ctx = (edge.context_data as Record<string, unknown>) ?? {};
        const jobTitle = typeof ctx.job_title === 'string' ? ctx.job_title.toLowerCase() : '';
        return jobTitle.includes(roleLower);
      })
    : rosterEdges;

  if (filtered.length === 0) return [];

  const personEntityIds = filtered.map((e) => e.source_entity_id);

  // Fetch person display names + avatars
  const { data: personEnts } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, avatar_url')
    .in('id', personEntityIds);

  const personMap = new Map(
    (personEnts ?? []).map((e) => [e.id, e])
  );

  const workspaceId = orgEnt.owner_workspace_id ?? null;

  // Fetch most recent confirmed/dispatched assignment per entity
  type AssignmentRow = { entity_id: string | null; created_at: string };
  let assignmentRows: AssignmentRow[] = [];

  if (workspaceId) {
    const { data: aRows } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .select('entity_id, created_at')
      .eq('workspace_id', workspaceId)
      .in('status', ['confirmed', 'dispatched'])
      .in('entity_id', personEntityIds)
      .order('created_at', { ascending: false });

    assignmentRows = (aRows ?? []) as AssignmentRow[];
  }

  // Aggregate: last assigned date and count per entity_id
  const lastAssignedMap = new Map<string, string>();
  const countMap = new Map<string, number>();

  for (const row of assignmentRows) {
    if (!row.entity_id) continue;
    if (!lastAssignedMap.has(row.entity_id)) {
      lastAssignedMap.set(row.entity_id, row.created_at);
    }
    countMap.set(row.entity_id, (countMap.get(row.entity_id) ?? 0) + 1);
  }

  // Build result array
  const results: PreferredCrewMember[] = filtered.map((edge) => {
    const ent = personMap.get(edge.source_entity_id);
    const ctx = (edge.context_data as Record<string, unknown>) ?? {};
    // job_title lives on the ROSTER_MEMBER cortex edge context_data — not in entity attributes
    const jobTitle = typeof ctx.job_title === 'string' ? ctx.job_title : null;

    return {
      entityId: edge.source_entity_id,
      relationshipId: edge.id,
      name: ent?.display_name ?? 'Unknown',
      avatarUrl: ent?.avatar_url ?? null,
      jobTitle,
      lastAssignedAt: lastAssignedMap.get(edge.source_entity_id) ?? null,
      assignmentCount: countMap.get(edge.source_entity_id) ?? 0,
    };
  });

  // Sort: most recently assigned first (nulls last), then alphabetically
  results.sort((a, b) => {
    if (a.lastAssignedAt && b.lastAssignedAt) {
      return b.lastAssignedAt.localeCompare(a.lastAssignedAt);
    }
    if (a.lastAssignedAt) return -1;
    if (b.lastAssignedAt) return 1;
    return a.name.localeCompare(b.name);
  });

  return results.slice(0, 20);
}

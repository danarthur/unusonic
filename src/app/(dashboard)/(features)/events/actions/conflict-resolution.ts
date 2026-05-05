'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { DealIds, DealCrewIds, EntityIds, type DealId, type DealCrewId, type EntityId } from '@/shared/types/branded-ids';

// =============================================================================
// swapCrewMember
// Removes the old crew member and assigns a new entity to the same deal
// with the same role. Workspace-scoped, UUID-validated.
// =============================================================================

export async function swapCrewMember(
  rawDealId: string,
  rawOldDealCrewId: string,
  rawNewEntityId: string,
  roleNote: string | null,
): Promise<{ success: boolean; error?: string }> {
  let dealId: DealId, oldDealCrewId: DealCrewId, newEntityId: EntityId;
  try {
    dealId = DealIds.parse(rawDealId);
    oldDealCrewId = DealCrewIds.parse(rawOldDealCrewId);
    newEntityId = EntityIds.parse(rawNewEntityId);
  } catch {
    return { success: false, error: 'Invalid input' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    // Verify the old row belongs to the caller's workspace
    const { data: oldRow } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, deal_id, workspace_id, role_note')
      .eq('id', oldDealCrewId)
      .single();

    if (!oldRow || oldRow.workspace_id !== workspaceId || oldRow.deal_id !== dealId) {
      return { success: false, error: 'Not authorised' };
    }

    const effectiveRole = roleNote ?? oldRow.role_note ?? null;

    // Delete the old crew row
    const { error: deleteErr } = await supabase
      .schema('ops')
      .from('deal_crew')
      .delete()
      .eq('id', oldDealCrewId)
      .eq('workspace_id', workspaceId);

    if (deleteErr) return { success: false, error: deleteErr.message };

    // Insert the new crew member with the same role
    const { error: insertErr } = await supabase
      .schema('ops')
      .from('deal_crew')
      .upsert(
        {
          deal_id: dealId,
          workspace_id: workspaceId,
          entity_id: newEntityId,
          role_note: effectiveRole,
          source: 'manual',
        },
        { onConflict: 'deal_id,entity_id' },
      )
      .select('id')
      .single();

    if (insertErr) return { success: false, error: insertErr.message };

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// searchAvailableAlternatives
// Finds crew members matching a role hint, excluding already-conflicting entities.
// Reuses the same roster + network search pattern as searchCrewMembers.
// =============================================================================

export type AlternativeCrewResult = {
  id: string;
  name: string;
  type: string;
  dayRate: number | null;
  section: 'team' | 'network';
  jobTitle: string | null;
};

export async function searchAvailableAlternatives(
  orgId: string,
  query: string,
  roleHint: string | null,
  excludeEntityIds: string[],
): Promise<AlternativeCrewResult[]> {
  const parsed = z.object({
    orgId: z.string().uuid(),
    query: z.string().max(200),
  }).safeParse({ orgId, query });
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const q = query.trim();
  const roleLower = roleHint?.trim().toLowerCase() ?? '';
  const hasRoleFilter = !!roleHint?.trim();

  // Need at least a query or role filter
  if (!q && !hasRoleFilter) return [];

  // Resolve the workspace's company entity
  const { data: orgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();
  if (!orgEnt?.id) return [];

  // Get ROSTER_MEMBER edges
  const { data: rosterRels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, context_data')
    .eq('target_entity_id', orgEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER');

  const activeRosterRels = (rosterRels ?? []).filter(
    (r) => !(r.context_data as Record<string, unknown>)?.deleted_at,
  );
  const rosterEntityIds = activeRosterRels
    .map((r) => r.source_entity_id)
    .filter((id) => !excludeEntityIds.includes(id));
  const rosterCtxById = new Map(
    activeRosterRels.map((r) => [r.source_entity_id, r.context_data as Record<string, unknown>]),
  );

  const results: AlternativeCrewResult[] = [];
  const excludeSet = new Set(excludeEntityIds);

  if (rosterEntityIds.length > 0) {
    const [rosterEntResult, crewSkillsResult] = await Promise.all([
      supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, attributes')
        .in('id', rosterEntityIds),
      supabase
        .schema('ops')
        .from('crew_skills')
        .select('entity_id, skill_tag')
        .in('entity_id', rosterEntityIds)
        .eq('workspace_id', workspaceId),
    ]);

    const crewSkillsByEntityId = new Map<string, string[]>();
    for (const row of crewSkillsResult.data ?? []) {
      const list = crewSkillsByEntityId.get(row.entity_id) ?? [];
      list.push(row.skill_tag);
      crewSkillsByEntityId.set(row.entity_id, list);
    }

    const qLower = q.toLowerCase();

    for (const e of rosterEntResult.data ?? []) {
      if (excludeSet.has(e.id)) continue;
      const ctx = rosterCtxById.get(e.id) ?? {};
      const jobTitle = ((ctx.job_title as string | null) ?? '').toLowerCase();
      const skills = (crewSkillsByEntityId.get(e.id) ?? []).map((s) => s.toLowerCase());

      if (hasRoleFilter) {
        const roleMatch = skills.some((s) => s.includes(roleLower) || roleLower.includes(s));
        if (q) {
          if (!(roleMatch && (e.display_name?.toLowerCase().includes(qLower) ?? false))) continue;
        } else {
          if (!roleMatch) continue;
        }
      } else if (q) {
        const nameMatch = e.display_name?.toLowerCase().includes(qLower) ?? false;
        const titleMatch = jobTitle.includes(qLower);
        const skillMatch = skills.some((s) => s.includes(qLower));
        if (!nameMatch && !titleMatch && !skillMatch) continue;
      }

      const dayRate = typeof (ctx.day_rate as number | null) === 'number' ? (ctx.day_rate as number) : null;

      results.push({
        id: e.id,
        name: e.display_name ?? 'Unnamed',
        type: 'person',
        dayRate,
        section: 'team',
        jobTitle: (ctx.job_title as string | null) ?? null,
      });
    }
  }

  return results.slice(0, 20);
}

// =============================================================================
// acceptGearConflict
// Marks a gear item's conflict as accepted with a note in JSONB.
// =============================================================================

export async function acceptGearConflict(
  eventId: string,
  gearName: string,
  note: string,
): Promise<{ success: boolean; error?: string }> {
  const parsed = z.object({
    eventId: z.string().uuid(),
    gearName: z.string().min(1).max(200),
    note: z.string().max(500),
  }).safeParse({ eventId, gearName, note });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    // Get the event and verify workspace
    const { data: event } = await supabase
      .schema('ops')
      .from('events')
      .select('id, project_id, run_of_show_data, project:projects!inner(workspace_id)')
      .eq('id', eventId)
      .maybeSingle();

    const evt = event as { id: string; project_id: string; run_of_show_data: Record<string, unknown> | null; project: { workspace_id: string } } | null;
    if (!evt || evt.project.workspace_id !== workspaceId) {
      return { success: false, error: 'Not authorised' };
    }

    const ros = evt.run_of_show_data ?? {};
    const acceptedConflicts = (ros.accepted_gear_conflicts as Record<string, string>[]) ?? [];
    acceptedConflicts.push({ gear_name: gearName, note, accepted_at: new Date().toISOString() });

    const { error } = await supabase
      .schema('ops')
      .from('events')
      .update({
        run_of_show_data: { ...ros, accepted_gear_conflicts: acceptedConflicts },
      })
      .eq('id', eventId)
      .eq('project_id', evt.project_id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

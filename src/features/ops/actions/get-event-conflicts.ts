'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type ConflictResourceType = 'crew' | 'gear';

export type EventConflict = {
  eventId: string;
  eventName: string;
  resourceType: ConflictResourceType;
  resourceName: string;
  /** entity_id of the conflicting crew member (null for role-only / gear conflicts) */
  entityId: string | null;
  /** deal_crew row ID for the current event (null when not resolvable) */
  dealCrewId: string | null;
};

export type GetEventConflictsResult = {
  conflicts: EventConflict[];
};

type RunOfShowRow = {
  crew_roles?: string[] | null;
  crew_items?: { role: string }[] | null;
  gear_requirements?: string | null;
  gear_items?: { name: string }[] | null;
  [key: string]: unknown;
};

function getCrewRoleNames(ros: RunOfShowRow | null): string[] {
  if (!ros) return [];
  if (Array.isArray(ros.crew_items)) {
    return ros.crew_items.map((c) => c.role).filter(Boolean);
  }
  if (Array.isArray(ros.crew_roles)) {
    return ros.crew_roles.filter((s): s is string => typeof s === 'string');
  }
  return [];
}

function getGearResourceNames(ros: RunOfShowRow | null): string[] {
  if (!ros) return [];
  if (Array.isArray(ros.gear_items)) {
    return ros.gear_items.map((g) => g.name).filter(Boolean);
  }
  if (ros.gear_requirements && String(ros.gear_requirements).trim()) {
    return ['Gear requirements'];
  }
  return [];
}

/**
 * Returns conflicts for an event: overlapping events in the same workspace
 * that share the same crew roles or gear resources (from run_of_show_data).
 */
export async function getEventConflicts(eventId: string): Promise<GetEventConflictsResult> {
  if (!z.string().uuid().safeParse(eventId).success) {
    return { conflicts: [] };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { conflicts: [] };
  }

  const supabase = await createClient();

  const { data: current, error: currentErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, run_of_show_data, project_id')
    .eq('id', eventId)
    .maybeSingle();

  if (currentErr || !current) {
    return { conflicts: [] };
  }

  const curr = current as {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
    run_of_show_data: RunOfShowRow | null;
    project_id: string | null;
  };

  const { data: project } = await supabase
    .schema('ops')
    .from('projects')
    .select('workspace_id')
    .eq('id', curr.project_id)
    .maybeSingle();

  const wsId = (project as { workspace_id?: string } | null)?.workspace_id;
  if (!wsId || wsId !== workspaceId) {
    return { conflicts: [] };
  }

  const startAt = curr.starts_at;
  const endAt = curr.ends_at;

  const { data: overlapping, error: overlapErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, run_of_show_data, project:projects!inner(workspace_id)')
    .eq('projects.workspace_id', workspaceId)
    .neq('id', eventId)
    .lte('starts_at', endAt)
    .gte('ends_at', startAt);

  if (overlapErr || !overlapping?.length) {
    return { conflicts: [] };
  }

  const currentCrew = getCrewRoleNames(curr.run_of_show_data);
  const currentGear = getGearResourceNames(curr.run_of_show_data);
  const conflicts: EventConflict[] = [];

  // ── Entity-level crew conflicts (deal_crew → deal_crew overlap) ────────
  // Get deal_crew rows for the current event's deal (via project)
  const { data: currentDealCrewRaw } = await (supabase as any)
    .schema('ops')
    .from('deal_crew')
    .select('id, entity_id, role_note, deal_id')
    .eq('workspace_id', workspaceId)
    .not('entity_id', 'is', null);

  const currentDealCrew = (currentDealCrewRaw ?? []) as {
    id: string;
    entity_id: string;
    role_note: string | null;
    deal_id: string;
  }[];

  // Get the current event's deal_id from the project
  const { data: currentProject } = await supabase
    .schema('ops')
    .from('projects')
    .select('deal_id')
    .eq('id', curr.project_id)
    .maybeSingle();
  const currentDealId = (currentProject as { deal_id?: string | null } | null)?.deal_id;

  // Build sets: current event crew entity IDs + their deal_crew row IDs
  const currentEntityDealCrewMap = new Map<string, string>(); // entity_id → deal_crew.id
  if (currentDealId) {
    for (const dc of currentDealCrew) {
      if (dc.deal_id === currentDealId && dc.entity_id) {
        currentEntityDealCrewMap.set(dc.entity_id, dc.id);
      }
    }
  }

  // Get overlapping event deal IDs
  const overlappingProjectIds = (overlapping as unknown as { id: string; title: string; run_of_show_data: RunOfShowRow | null }[])
    .map((o) => o.id);
  const { data: overlappingProjectsRaw } = await supabase
    .schema('ops')
    .from('events')
    .select('id, project:projects!inner(deal_id)')
    .in('id', overlappingProjectIds);

  const overlappingEventDealMap = new Map<string, string>(); // event_id → deal_id
  for (const ep of (overlappingProjectsRaw ?? []) as unknown as { id: string; project: { deal_id: string | null } }[]) {
    if (ep.project?.deal_id) overlappingEventDealMap.set(ep.id, ep.project.deal_id);
  }

  // Build map: other deal entity_ids → { entity_id, deal_id }
  const otherDealEntitySets = new Map<string, Set<string>>(); // deal_id → Set<entity_id>
  for (const dc of currentDealCrew) {
    if (dc.deal_id !== currentDealId && dc.entity_id) {
      const set = otherDealEntitySets.get(dc.deal_id) ?? new Set();
      set.add(dc.entity_id);
      otherDealEntitySets.set(dc.deal_id, set);
    }
  }

  // Track entity-level conflicts to avoid duplication with role-level
  const entityConflictsFound = new Set<string>(); // `${entityId}-${eventId}`

  for (const row of overlapping as { id: string; title: string; run_of_show_data: RunOfShowRow | null }[]) {
    const otherDealId = overlappingEventDealMap.get(row.id);
    if (otherDealId) {
      const otherEntityIds = otherDealEntitySets.get(otherDealId);
      if (otherEntityIds) {
        for (const entityId of currentEntityDealCrewMap.keys()) {
          if (otherEntityIds.has(entityId)) {
            // Find the crew member's name from the deal_crew row
            const dcRow = currentDealCrew.find((dc) => dc.entity_id === entityId && dc.deal_id === currentDealId);
            const dealCrewId = dcRow?.id ?? null;
            const roleName = dcRow?.role_note ?? 'Crew member';
            const conflictKey = `${entityId}-${row.id}`;
            entityConflictsFound.add(conflictKey);
            conflicts.push({
              eventId: row.id,
              eventName: row.title ?? 'Untitled',
              resourceType: 'crew',
              resourceName: roleName,
              entityId,
              dealCrewId,
            });
          }
        }
      }
    }
  }

  // ── Role-name-level conflicts (legacy JSONB-based) ─────────────────────
  for (const row of overlapping as { id: string; title: string; run_of_show_data: RunOfShowRow | null }[]) {
    const otherCrew = getCrewRoleNames(row.run_of_show_data);
    const otherGear = getGearResourceNames(row.run_of_show_data);

    const crewIntersection = currentCrew.filter((r) => otherCrew.includes(r));
    for (const resourceName of crewIntersection) {
      // Skip if we already have an entity-level conflict for the same event
      const alreadyCovered = Array.from(entityConflictsFound).some((k) => k.endsWith(`-${row.id}`));
      if (!alreadyCovered) {
        conflicts.push({
          eventId: row.id,
          eventName: row.title ?? 'Untitled',
          resourceType: 'crew',
          resourceName,
          entityId: null,
          dealCrewId: null,
        });
      }
    }

    const gearIntersection = currentGear.filter((g) => otherGear.includes(g));
    for (const resourceName of gearIntersection) {
      conflicts.push({
        eventId: row.id,
        eventName: row.title ?? 'Untitled',
        resourceType: 'gear',
        resourceName,
        entityId: null,
        dealCrewId: null,
      });
    }
  }

  // ── Resolve entity display names for entity-level conflicts ──────────
  const entityIdsToResolve = [...new Set(conflicts.filter((c) => c.entityId).map((c) => c.entityId!))];
  if (entityIdsToResolve.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', entityIdsToResolve);
    const nameMap = new Map((entities ?? []).map((e: { id: string; display_name: string | null }) => [e.id, e.display_name]));
    for (const c of conflicts) {
      if (c.entityId && nameMap.has(c.entityId)) {
        const displayName = nameMap.get(c.entityId);
        if (displayName) {
          c.resourceName = displayName;
        }
      }
    }
  }

  return { conflicts };
}

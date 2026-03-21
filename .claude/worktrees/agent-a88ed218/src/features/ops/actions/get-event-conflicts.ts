'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type ConflictResourceType = 'crew' | 'gear';

export type EventConflict = {
  eventId: string;
  eventName: string;
  resourceType: ConflictResourceType;
  resourceName: string;
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

  for (const row of overlapping as { id: string; title: string; run_of_show_data: RunOfShowRow | null }[]) {
    const otherCrew = getCrewRoleNames(row.run_of_show_data);
    const otherGear = getGearResourceNames(row.run_of_show_data);

    const crewIntersection = currentCrew.filter((r) => otherCrew.includes(r));
    for (const resourceName of crewIntersection) {
      conflicts.push({
        eventId: row.id,
        eventName: row.title ?? 'Untitled',
        resourceType: 'crew',
        resourceName,
      });
    }

    const gearIntersection = currentGear.filter((g) => otherGear.includes(g));
    for (const resourceName of gearIntersection) {
      conflicts.push({
        eventId: row.id,
        eventName: row.title ?? 'Untitled',
        resourceType: 'gear',
        resourceName,
      });
    }
  }

  return { conflicts };
}

'use server';
 

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { AssignedCrewEntry } from '@/app/(dashboard)/(features)/productions/actions/run-of-show-types';

export async function getEventCrew(eventId: string): Promise<AssignedCrewEntry[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Only surface crew that are actually coming to the show. Excludes
  // declined/dropped assignments so the cue-assignment dropdown in the
  // Run-of-Show editor cannot phantom-assign someone who said no.
  const { data: assignments, error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('entity_id, assignee_name, role, status')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .not('entity_id', 'is', null)
    .not('status', 'in', '(declined,dropped)');

  if (error || !assignments) return [];

  const entityIds = (assignments as Array<{ entity_id: string | null; assignee_name: string | null; role: string | null }>)
    .map((a) => a.entity_id)
    .filter((id): id is string => !!id);

  let entityNames: Record<string, string> = {};
  if (entityIds.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', entityIds);

    if (entities) {
      entityNames = Object.fromEntries(
        (entities as Array<{ id: string; display_name: string | null }>)
          .map((e) => [e.id, e.display_name ?? ''])
      );
    }
  }

  return (assignments as Array<{ entity_id: string | null; assignee_name: string | null; role: string | null }>)
    .filter((a) => !!a.entity_id)
    .map((a) => ({
      entity_id: a.entity_id as string,
      display_name: entityNames[a.entity_id as string] || a.assignee_name || 'Unknown',
      role: a.role ?? null,
    }));
}

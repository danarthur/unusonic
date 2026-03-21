'use server';

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { createClient } from '@/shared/api/supabase/server';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';
import { updateFlightCheckStatus } from './update-flight-check-status';

export type AssignCrewMemberResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Assigns an internal team member to a crew slot and sets status to confirmed.
 * Updates run_of_show_data.crew_items[crewIndex] with entity_id and assignee_name.
 */
export async function assignCrewMember(
  eventId: string,
  crewIndex: number,
  entityId: string,
  assigneeName: string
): Promise<AssignCrewMemberResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { data: event, error: fetchErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, run_of_show_data, project:projects!inner(workspace_id)')
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (fetchErr || !event) {
    return { success: false, error: 'Event not found.' };
  }

  const ros = (event as { run_of_show_data: RunOfShowData | null }).run_of_show_data ?? {};
  let crewItems = Array.isArray(ros.crew_items) && ros.crew_items.length > 0
    ? [...ros.crew_items]
    : Array.isArray(ros.crew_roles)
      ? ros.crew_roles.map((role: string) => ({ role: String(role), status: 'requested' as const }))
      : [];

  if (crewIndex < 0 || crewIndex >= crewItems.length) {
    return { success: false, error: 'Invalid crew slot.' };
  }

  const item = crewItems[crewIndex] as { role: string; status: string; entity_id?: string | null; assignee_name?: string | null };
  crewItems[crewIndex] = {
    ...item,
    role: item.role,
    status: 'confirmed',
    entity_id: entityId,
    assignee_name: assigneeName,
  };

  return updateFlightCheckStatus(eventId, { crew_items: crewItems });
}

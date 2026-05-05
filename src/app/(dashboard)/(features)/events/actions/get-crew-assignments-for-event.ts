'use server';

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { createClient } from '@/shared/api/supabase/server';

export type CrewAssignmentRow = {
  /** ops.crew_assignments.id — pass to removeCrewItem. */
  id: string;
  role: string | null;
  assignee_name: string | null;
  entity_id: string | null;
  status: string | null;
};

/**
 * Reads ops.crew_assignments for an event. This is the source of truth the
 * Event Studio Team panel's assign/remove actions write to, so the panel
 * must read from it too (instead of the legacy run_of_show_data.crew_items
 * JSONB) or assignments silently never appear on the UI.
 */
export async function getCrewAssignmentsForEvent(
  eventId: string,
): Promise<CrewAssignmentRow[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, role, assignee_name, entity_id, status, sort_order')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: true });

  if (error || !data) {
    if (error) console.error('[CRM] getCrewAssignmentsForEvent:', error.message);
    return [];
  }

  return (data as Array<{
    id: string;
    role: string | null;
    assignee_name: string | null;
    entity_id: string | null;
    status: string | null;
  }>).map((r) => ({
    id: r.id,
    role: r.role,
    assignee_name: r.assignee_name,
    entity_id: r.entity_id,
    status: r.status,
  }));
}

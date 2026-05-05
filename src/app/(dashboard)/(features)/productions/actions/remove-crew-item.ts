'use server';

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { createClient } from '@/shared/api/supabase/server';

export type RemoveCrewItemResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Removes a crew assignment by its UUID from ops.crew_assignments.
 */
export async function removeCrewItem(
  eventId: string,
  assignmentId: string
): Promise<RemoveCrewItemResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .delete()
    .eq('id', assignmentId)
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] removeCrewItem:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

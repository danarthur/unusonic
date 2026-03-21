'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { sendCrewReminder, type SendReminderResult } from '@/features/crew-notifications/api/send-reminder-email';

export type { SendReminderResult };

/**
 * Server action wrapper for sending a crew reminder email.
 * Verifies workspace membership before delegating to the system-client action.
 */
export async function sendCrewReminderAction(
  assignmentId: string
): Promise<SendReminderResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // RLS-scoped SELECT — returns null if assignment isn't in caller's workspace
  const { data: assignment } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('workspace_id')
    .eq('id', assignmentId)
    .single();

  if (!assignment || (assignment as { workspace_id: string }).workspace_id !== workspaceId) {
    return { success: false, error: 'Not authorised.' };
  }

  return sendCrewReminder(assignmentId);
}

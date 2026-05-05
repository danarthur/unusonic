'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { sendCrewReminder } from '@/features/crew-notifications/api/send-reminder-email';
import type { SendReminderResult } from '@/features/crew-notifications/api/send-reminder-email';

// Do NOT re-export `SendReminderResult` — Next 16 server-action registry
// throws `ReferenceError` on type-only re-exports. Consumers should import
// the type directly from `@/features/crew-notifications/api/send-reminder-email`.

/**
 * Sends a reminder email for a crew assignment identified by event + entity.
 * Used when the caller has entity_id but not assignment UUID (e.g. CrewFlightCheck
 * which reads from the JSONB run_of_show_data shape).
 *
 * Looks up the first matching `requested` crew_assignment row for this entity
 * on this event, then delegates to the standard sendCrewReminder action.
 */
export async function sendCrewReminderByEntity(
  eventId: string,
  entityId: string
): Promise<SendReminderResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();
   
  const db = supabase;

  // RLS-scoped: only returns rows in caller's workspace
  const { data: assignment, error } = await db
    .schema('ops')
    .from('crew_assignments')
    .select('id, workspace_id')
    .eq('event_id', eventId)
    .eq('entity_id', entityId)
    .eq('status', 'requested')
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !assignment) {
    return { success: false, error: 'No pending assignment found for this crew member.' };
  }

  return sendCrewReminder((assignment as { id: string }).id);
}

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { CallTimeSlot } from '@/entities/event/api/get-event-summary';
import { updateFlightCheckStatus } from './update-flight-check-status';

export type UpdateCallTimeSlotsResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Replaces the call_time_slots array on an event's run_of_show_data.
 * Slots remain in JSONB; crew assignments reference them by slot UUID.
 */
export async function updateCallTimeSlots(
  eventId: string,
  slots: CallTimeSlot[]
): Promise<UpdateCallTimeSlotsResult> {
  return updateFlightCheckStatus(eventId, {
    call_time_slots: slots.length > 0 ? slots : null,
  });
}

/**
 * Assigns a crew member to a call time slot (or clears their slot assignment).
 * Updates ops.crew_assignments by assignmentId UUID.
 */
export async function assignCrewCallTime(
  eventId: string,
  assignmentId: string,
  slotId: string | null,
  override: string | null
): Promise<UpdateCallTimeSlotsResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .update({
      call_time_slot_id: slotId ?? null,
      call_time_override: override ? new Date(override).toISOString() : null,
    })
    .eq('id', assignmentId)
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] assignCrewCallTime:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

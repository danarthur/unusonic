'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type RescheduleEventResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Reschedules an ops.event by replacing its date portion while preserving time.
 * Ownership is verified via two-step: workspace project IDs → event project_id.
 *
 * @param eventId - UUID of the ops.event to reschedule
 * @param newDate - New date as ISO date string (YYYY-MM-DD)
 */
export async function rescheduleEvent(
  eventId: string,
  newDate: string
): Promise<RescheduleEventResult> {
  // Validate newDate format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    return { success: false, error: 'Invalid date format. Expected YYYY-MM-DD.' };
  }

  try {
    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return { success: false, error: 'No active workspace.' };
    }

    const supabase = await createClient();

    // Step 1: get all project IDs owned by this workspace
    const { data: projects, error: projectsError } = await supabase
      .schema('ops')
      .from('projects')
      .select('id')
      .eq('workspace_id', workspaceId);

    if (projectsError) {
      console.error('[CRM] rescheduleEvent projects lookup error:', projectsError.message);
      return { success: false, error: projectsError.message };
    }

    const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
    if (projectIds.length === 0) {
      return { success: false, error: 'Not authorised.' };
    }

    // Step 2: confirm this event belongs to one of those projects and read current start_at
    const { data: event, error: eventError } = await supabase
      .schema('ops')
      .from('events')
      .select('id, start_at')
      .eq('id', eventId)
      .in('project_id', projectIds)
      .maybeSingle();

    if (eventError) {
      console.error('[CRM] rescheduleEvent event lookup error:', eventError.message);
      return { success: false, error: eventError.message };
    }

    if (!event) {
      return { success: false, error: 'Not authorised.' };
    }

    // Step 3: build new start_at — preserve existing time component, replace date.
    // Postgres normalises timestamptz to UTC on storage, so getUTCHours() is correct here.
    const existingStartAt = (event as { start_at: string | null }).start_at;
    let timePart = '08:00:00';
    if (existingStartAt) {
      const existingDate = new Date(existingStartAt);
      const hh = String(existingDate.getUTCHours()).padStart(2, '0');
      const mm = String(existingDate.getUTCMinutes()).padStart(2, '0');
      const ss = String(existingDate.getUTCSeconds()).padStart(2, '0');
      timePart = `${hh}:${mm}:${ss}`;
    }

    const newStartAt = `${newDate}T${timePart}Z`;

    // Step 4: update
    const { error: updateError } = await supabase
      .schema('ops')
      .from('events')
      .update({ start_at: newStartAt })
      .eq('id', eventId);

    if (updateError) {
      console.error('[CRM] rescheduleEvent update error:', updateError.message);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/events');
    revalidatePath('/calendar');
    revalidatePath(`/events/g/${eventId}`);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reschedule event';
    console.error('[CRM] rescheduleEvent unexpected:', err);
    return { success: false, error: message };
  }
}

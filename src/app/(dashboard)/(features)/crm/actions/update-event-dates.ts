'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

export type UpdateEventDatesResult = { success: true } | { success: false; error: string };

/**
 * Updates starts_at and ends_at on an ops.events row.
 * Workspace-scoped — silently fails if eventId doesn't belong to the active workspace.
 */
export async function updateEventDates(
  eventId: string,
  startsAt: string,
  endsAt: string | null,
): Promise<UpdateEventDatesResult> {
  if (!startsAt || Number.isNaN(Date.parse(startsAt))) {
    return { success: false, error: 'Start date/time is required.' };
  }
  if (endsAt && Number.isNaN(Date.parse(endsAt))) {
    return { success: false, error: 'Invalid end date/time.' };
  }
  if (endsAt && new Date(endsAt) <= new Date(startsAt)) {
    return { success: false, error: 'End time must be after start time.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({
      starts_at: new Date(startsAt).toISOString(),
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] updateEventDates:', error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/crm');
  revalidatePath('/calendar');
  return { success: true };
}

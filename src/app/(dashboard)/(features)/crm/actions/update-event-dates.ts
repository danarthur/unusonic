'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { revalidatePath } from 'next/cache';

const uuidSchema = z.string().uuid();

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
  if (!uuidSchema.safeParse(eventId).success) {
    return { success: false, error: 'Invalid event ID.' };
  }
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

/**
 * Updates dates_load_in and dates_load_out on an ops.events row.
 * Workspace-scoped — silently fails if eventId doesn't belong to the active workspace.
 */
export async function updateEventLoadDates(
  eventId: string,
  loadIn: string | null,
  loadOut: string | null,
): Promise<UpdateEventDatesResult> {
  if (!uuidSchema.safeParse(eventId).success) {
    return { success: false, error: 'Invalid event ID.' };
  }
  if (loadIn && Number.isNaN(Date.parse(loadIn))) {
    return { success: false, error: 'Invalid load-in date/time.' };
  }
  if (loadOut && Number.isNaN(Date.parse(loadOut))) {
    return { success: false, error: 'Invalid load-out date/time.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({
      dates_load_in: loadIn ? new Date(loadIn).toISOString() : null,
      dates_load_out: loadOut ? new Date(loadOut).toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] updateEventLoadDates:', error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/crm');
  revalidatePath('/calendar');
  return { success: true };
}

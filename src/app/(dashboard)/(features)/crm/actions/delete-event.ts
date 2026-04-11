'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type DeleteEventResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Hard-deletes an ops.event by id.
 * Ownership verified via two-step pattern:
 * 1. Fetch project IDs for this workspace.
 * 2. Confirm the event's project_id is in that set.
 */
export async function deleteEvent(eventId: string): Promise<DeleteEventResult> {
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
      console.error('[CRM] deleteEvent projects lookup error:', projectsError.message);
      return { success: false, error: projectsError.message };
    }

    const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
    if (projectIds.length === 0) {
      return { success: false, error: 'Not authorised.' };
    }

    // Step 2: confirm this event belongs to one of those projects
    const { data: event, error: eventError } = await supabase
      .schema('ops')
      .from('events')
      .select('id')
      .eq('id', eventId)
      .in('project_id', projectIds)
      .maybeSingle();

    if (eventError) {
      console.error('[CRM] deleteEvent event lookup error:', eventError.message);
      return { success: false, error: eventError.message };
    }

    if (!event) {
      return { success: false, error: 'Not authorised.' };
    }

    // Step 3: delete
    const { error: deleteError } = await supabase
      .schema('ops')
      .from('events')
      .delete()
      .eq('id', eventId);

    if (deleteError) {
      console.error('[CRM] deleteEvent delete error:', deleteError.message);
      return { success: false, error: deleteError.message };
    }

    revalidatePath('/crm');
    revalidatePath('/calendar');

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete event';
    console.error('[CRM] deleteEvent unexpected:', err);
    return { success: false, error: message };
  }
}

export type CancelEventResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Sets lifecycle_status = 'cancelled' on an ops.event.
 * Ownership verified via two-step pattern:
 * 1. Fetch project IDs for this workspace.
 * 2. Confirm the event's project_id is in that set.
 */
export async function cancelEvent(eventId: string): Promise<CancelEventResult> {
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
      console.error('[CRM] cancelEvent projects lookup error:', projectsError.message);
      return { success: false, error: projectsError.message };
    }

    const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
    if (projectIds.length === 0) {
      return { success: false, error: 'Not authorised.' };
    }

    // Step 2: confirm this event belongs to one of those projects
    const { data: event, error: eventError } = await supabase
      .schema('ops')
      .from('events')
      .select('id')
      .eq('id', eventId)
      .in('project_id', projectIds)
      .maybeSingle();

    if (eventError) {
      console.error('[CRM] cancelEvent event lookup error:', eventError.message);
      return { success: false, error: eventError.message };
    }

    if (!event) {
      return { success: false, error: 'Not authorised.' };
    }

    // Step 3: update — write BOTH columns. `lifecycle_status` is the CRM
    // stream filter column; `status` is the computeEventLock signal read by
    // the client portal. Until the two parallel state columns are merged
    // (Pass 3 schema-drift work), cancel flows must touch both or the
    // client portal will remain unlocked for a cancelled event.
    const { error: updateError } = await supabase
      .schema('ops')
      .from('events')
      .update({ lifecycle_status: 'cancelled', status: 'cancelled' })
      .eq('id', eventId);

    if (updateError) {
      console.error('[CRM] cancelEvent update error:', updateError.message);
      return { success: false, error: updateError.message };
    }

    revalidatePath('/crm');
    revalidatePath('/calendar');

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel event';
    console.error('[CRM] cancelEvent unexpected:', err);
    return { success: false, error: message };
  }
}

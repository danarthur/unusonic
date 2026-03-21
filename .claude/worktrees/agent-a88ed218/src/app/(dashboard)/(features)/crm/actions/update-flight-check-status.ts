'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';

export type UpdateFlightCheckResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Merges a partial run_of_show_data update into the event's existing run_of_show_data.
 * Verifies workspace access via ops.events -> ops.projects.
 */
export async function updateFlightCheckStatus(
  eventId: string,
  update: Partial<RunOfShowData>
): Promise<UpdateFlightCheckResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { success: false, error: 'No active workspace.' };
  }

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

  const current = (event as { run_of_show_data: RunOfShowData | null }).run_of_show_data ?? {};
  const merged: RunOfShowData = {
    ...current,
    crew_items: update.crew_items !== undefined ? update.crew_items : current.crew_items ?? null,
    gear_items: update.gear_items !== undefined ? update.gear_items : current.gear_items ?? null,
    logistics: update.logistics !== undefined ? update.logistics : current.logistics ?? null,
  };

  const { error: updateErr } = await supabase
    .schema('ops')
    .from('events')
    .update({ run_of_show_data: merged as Record<string, unknown> })
    .eq('id', eventId);

  if (updateErr) {
    console.error('[CRM] updateFlightCheckStatus:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  return { success: true };
}

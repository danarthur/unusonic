'use server';

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { createClient } from '@/shared/api/supabase/server';
import { sendCrewAssignmentEmail } from '@/features/crew-notifications/api/send-assignment-email';

export type AssignOrAddCrewResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Assigns a team member to a named role on an event.
 *
 * - If an unassigned crew_assignment with that exact role already exists, updates it in place.
 * - If no unassigned slot for that role exists, inserts a new confirmed assignment.
 *
 * Used by the Event Studio Team card for both lead-role slots (Producer, PM)
 * and ad-hoc crew additions.
 */
export async function assignOrAddCrewMember(
  eventId: string,
  role: string,
  entityId: string,
  assigneeName: string,
  // UI input for scheduled_hours is deferred — accepted here so the data model is correct
  // when the caller knows the value (e.g. a future inline editor on the crew flight check row).
  scheduledHours?: number | null
): Promise<AssignOrAddCrewResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Look for an unassigned slot with this exact role
  const { data: existing } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .eq('role', role)
    .is('entity_id', null)
    .order('sort_order')
    .limit(1)
    .maybeSingle();

  if (existing) {
    const assignmentId = (existing as { id: string }).id;
    const { error } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .update({
        entity_id: entityId,
        assignee_name: assigneeName,
        status: 'confirmed',
        ...(scheduledHours != null && { scheduled_hours: scheduledHours }),
      })
      .eq('id', assignmentId)
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error('[CRM] assignOrAddCrewMember update:', error.message);
      return { success: false, error: error.message };
    }
    sendCrewAssignmentEmail(eventId, assignmentId, entityId).catch((e) =>
      console.error('[crew] sendCrewAssignmentEmail failed:', e)
    );
    return { success: true };
  }

  // No unassigned slot — get max sort_order and append
  const { data: maxRow } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('sort_order')
    .eq('event_id', eventId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSort = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;

  const { data: inserted, error: insertErr } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .insert({
      event_id: eventId,
      workspace_id: workspaceId,
      role,
      entity_id: entityId,
      assignee_name: assigneeName,
      status: 'confirmed',
      sort_order: nextSort,
      booking_type: 'labor',
      source_package_id: null,
      quantity_index: 0,
      pay_rate: null,
      pay_rate_type: 'flat',
      scheduled_hours: scheduledHours ?? null,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[CRM] assignOrAddCrewMember insert:', insertErr.message);
    return { success: false, error: insertErr.message };
  }

  sendCrewAssignmentEmail(eventId, (inserted as { id: string }).id, entityId).catch((e) =>
    console.error('[crew] sendCrewAssignmentEmail failed:', e)
  );

  return { success: true };
}

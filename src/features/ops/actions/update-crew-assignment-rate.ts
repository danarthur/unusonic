'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getUserRoleSlug } from '@/shared/lib/permissions';
import { revalidatePath } from 'next/cache';

/**
 * Updates the pay rate on a crew_assignment row.
 * Permission-checked: employees cannot edit pay rates.
 */
export async function updateCrewAssignmentRate(
  assignmentId: string,
  payRate: number | null,
  payRateType?: 'flat' | 'hourly'
): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { success: false, error: 'No active workspace.' };
  }

  // Permission check: employees cannot edit pay rates
  const roleSlug = await getUserRoleSlug(workspaceId);
  if (roleSlug === 'employee') {
    return { success: false, error: 'Insufficient permissions to edit pay rates.' };
  }

  const supabase = await createClient();

  // Fetch the assignment to get the event_id for revalidation
  const { data: assignment, error: fetchErr } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, event_id')
    .eq('id', assignmentId)
    .eq('workspace_id', workspaceId)
    .single();

  if (fetchErr || !assignment) {
    return { success: false, error: 'Assignment not found or access denied.' };
  }

  const updatePayload: Record<string, unknown> = { pay_rate: payRate };
  if (payRateType) {
    updatePayload.pay_rate_type = payRateType;
  }

  const { error: updateErr } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .update(updatePayload)
    .eq('id', assignmentId)
    .eq('workspace_id', workspaceId);

  if (updateErr) {
    console.error('[ops] updateCrewAssignmentRate:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  const eventId = (assignment as { event_id: string }).event_id;
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/finance`);

  return { success: true };
}

'use server';

import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { createClient } from '@/shared/api/supabase/server';
import { applyRuleToCrewMember } from './apply-call-time-rules';
import { sendCrewAssignmentEmail } from '@/features/crew-notifications/api/send-assignment-email';
import { notifyNewGigRequest } from '@/shared/api/push/send-notification';

export type AssignCrewMemberResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Assigns an internal team member to a crew assignment row and sets status to confirmed.
 * Updates ops.crew_assignments by assignmentId (UUID).
 */
export async function assignCrewMember(
  eventId: string,
  assignmentId: string,
  entityId: string,
  assigneeName: string
): Promise<AssignCrewMemberResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Hydrate assignee_name from directory if the caller didn't provide one
  let resolvedName = assigneeName?.trim() || null;
  if (!resolvedName && entityId) {
    const { data: entity } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('id', entityId)
      .maybeSingle();
    resolvedName = (entity as { display_name?: string | null } | null)?.display_name ?? null;
  }

  // Fetch the current row to get the role (needed for email + call-time rules)
  const { data: assignment, error: fetchErr } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('role')
    .eq('id', assignmentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (fetchErr || !assignment) {
    return { success: false, error: 'Crew assignment not found.' };
  }

  const role = (assignment as { role: string }).role;

  const { error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .update({
      entity_id: entityId,
      assignee_name: resolvedName,
      status: 'confirmed',
    })
    .eq('id', assignmentId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] assignCrewMember:', error.message);
    return { success: false, error: error.message };
  }

  // Auto-apply call time rules (fire-and-forget)
  applyRuleToCrewMember(eventId, assignmentId, role, entityId).catch(() => {});
  // Send assignment email with confirmation link (fire-and-forget)
  sendCrewAssignmentEmail(eventId, assignmentId, entityId).catch(() => {});
  // Push notification to the assignee's devices (fire-and-forget)
  (async () => {
    try {
      const { data: ent } = await supabase
        .schema('directory')
        .from('entities')
        .select('claimed_by_user_id')
        .eq('id', entityId)
        .maybeSingle();
      if (!ent?.claimed_by_user_id) return;
      const { data: evt } = await supabase
        .schema('ops')
        .from('events')
        .select('title')
        .eq('id', eventId)
        .maybeSingle();
      await notifyNewGigRequest(ent.claimed_by_user_id, {
        eventTitle: evt?.title ?? 'an upcoming show',
        role,
      });
    } catch { /* non-critical */ }
  })();

  return { success: true };
}

'use server';

import { createClient } from '@/shared/api/supabase/server';

export type ClaimPositionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Employee claims an open crew position.
 * Sets entity_id to the employee's person entity and status to 'requested' (pending PM approval).
 */
export async function claimPosition(
  assignmentId: string,
  entityId: string
): Promise<ClaimPositionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  // Verify the entity belongs to this user
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name')
    .eq('id', entityId)
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { success: false, error: 'Person entity not found.' };

  // Verify the assignment is still open (entity_id IS NULL)
  const { data: assignment } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, entity_id')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment) return { success: false, error: 'Position not found.' };
  if (assignment.entity_id) return { success: false, error: 'This position has already been filled.' };

  // Claim: set entity_id and status to 'requested' (PM will confirm)
  const { error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .update({
      entity_id: entityId,
      assignee_name: person.display_name,
      status: 'requested',
    })
    .eq('id', assignmentId);

  if (error) {
    console.error('[claimPosition]', error.message);
    return { success: false, error: 'Failed to claim position.' };
  }

  return { success: true };
}

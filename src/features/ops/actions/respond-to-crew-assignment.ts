'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type CrewResponseResult = { ok: true } | { ok: false; error: string };

/**
 * Crew member confirms or declines an assignment from the portal.
 * Validates that the assignment belongs to the authenticated user's person entity.
 */
export async function respondToCrewAssignment(
  assignmentId: string,
  response: 'confirmed' | 'declined',
): Promise<CrewResponseResult> {
  if (!assignmentId) return { ok: false, error: 'Missing assignment ID.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  // Resolve the user's person entity
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { ok: false, error: 'No linked profile.' };

  // Fetch assignment and verify ownership
  const { data: assignment } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, entity_id, status')
    .eq('id', assignmentId)
    .maybeSingle();

  if (!assignment) return { ok: false, error: 'Assignment not found.' };
  if (assignment.entity_id !== person.id) return { ok: false, error: 'Not your assignment.' };
  if (assignment.status !== 'requested') return { ok: false, error: 'Already responded.' };

  // Update status
  const { error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .update({
      status: response,
      status_updated_at: new Date().toISOString(),
      status_updated_by: user.id,
    })
    .eq('id', assignmentId);

  if (error) {
    console.error('[respondToCrewAssignment]', error.message);
    return { ok: false, error: 'Failed to update.' };
  }

  return { ok: true };
}

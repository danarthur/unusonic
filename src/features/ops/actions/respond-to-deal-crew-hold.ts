'use server';

import { createClient } from '@/shared/api/supabase/server';

export type HoldResponse = 'available' | 'unavailable';

export type RespondToHoldResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Crew member responds to a deal hold.
 * - 'available' → sets acknowledged_at
 * - 'unavailable' → sets declined_at
 *
 * Validates entity ownership via claimed_by_user_id.
 */
export async function respondToDealCrewHold(
  holdId: string,
  entityId: string,
  response: HoldResponse
): Promise<RespondToHoldResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  // Verify entity belongs to this user
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { success: false, error: 'Entity not found.' };

  // Verify hold exists and belongs to this entity
  const { data: hold } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id, entity_id')
    .eq('id', holdId)
    .maybeSingle();

  if (!hold) return { success: false, error: 'Hold not found.' };
  if (hold.entity_id !== entityId) return { success: false, error: 'Not your hold.' };

  // Write response — "available" sets both acknowledged_at AND confirmed_at
  // so the CRM immediately reflects the crew member as confirmed
  const now = new Date().toISOString();
  const update = response === 'available'
    ? { acknowledged_at: now, confirmed_at: now }
    : { declined_at: now };

  const { error } = await supabase
    .schema('ops')
    .from('deal_crew')
    .update(update)
    .eq('id', holdId);

  if (error) {
    console.error('[respondToDealCrewHold]', error.message);
    return { success: false, error: 'Failed to save response.' };
  }

  return { success: true };
}

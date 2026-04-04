'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type DjTimelineItem = {
  id: string;
  label: string;
  time: string;
  songs: string[];
};

export type DjPrepData = {
  dj_timeline: DjTimelineItem[];
  dj_must_play: string[];
  dj_do_not_play: string[];
  dj_client_notes: string;
  dj_client_info: {
    couple_names: string;
    pronunciation: string;
    wedding_party: string;
    special_requests: string;
  };
};

export type SaveDjPrepResult = { ok: true } | { ok: false; error: string };

/**
 * Save DJ show prep data to the event's run_of_show_data JSONB.
 * Merges DJ-namespaced keys without overwriting existing data.
 */
export async function saveDjPrep(
  eventId: string,
  data: Partial<DjPrepData>,
): Promise<SaveDjPrepResult> {
  if (!eventId) return { ok: false, error: 'Missing event ID.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  // Verify user has access to this event via a crew assignment
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { ok: false, error: 'No linked profile.' };

  const { data: assignment } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id')
    .eq('event_id', eventId)
    .eq('entity_id', person.id)
    .limit(1)
    .maybeSingle();

  if (!assignment) return { ok: false, error: 'Not assigned to this event.' };

  // Atomic JSONB merge via RPC — prevents race conditions with concurrent saves
  const { error } = await supabase.rpc('patch_event_ros_data', {
    p_event_id: eventId,
    p_patch: data as unknown as Record<string, unknown>,
  });

  if (error) {
    console.error('[saveDjPrep]', error.message);
    return { ok: false, error: 'Failed to save.' };
  }

  return { ok: true };
}

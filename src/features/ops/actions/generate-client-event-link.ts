'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

type Result = { ok: true; url: string } | { ok: false; error: string };

/**
 * Generate (or return existing) client portal token for an event.
 * Requires the caller to be assigned to the event as crew.
 */
export async function generateClientEventLink(eventId: string): Promise<Result> {
  if (!eventId) return { ok: false, error: 'Missing event ID.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  // Verify user has access via crew assignment
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

  // Check if token already exists
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('client_portal_token')
    .eq('id', eventId)
    .maybeSingle();

  if (!event) return { ok: false, error: 'Event not found.' };

  if (event.client_portal_token) {
    return { ok: true, url: `/event/${event.client_portal_token}` };
  }

  // Generate new token
  const token = crypto.randomUUID();
  const { error } = await supabase
    .schema('ops')
    .from('events')
    .update({ client_portal_token: token })
    .eq('id', eventId);

  if (error) return { ok: false, error: 'Failed to generate link.' };

  return { ok: true, url: `/event/${token}` };
}

'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface SiblingEvent {
  eventId: string;
  title: string | null;
  startsAt: string | null;
  /** crew_assignment ID for the current user, if assigned to this day */
  assignmentId: string | null;
  isCurrentEvent: boolean;
}

/**
 * For multi-day productions: fetch all events in the same project.
 * Returns sibling events sorted by date, with the current user's
 * crew_assignment ID for each day they're assigned to.
 */
export async function getProjectSiblingEvents(
  eventId: string,
  entityId: string
): Promise<SiblingEvent[] | null> {
  const supabase = await createClient();

  // Get the event's project_id
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('project_id')
    .eq('id', eventId)
    .maybeSingle();

  if (!event?.project_id) return null;

  // Fetch sibling events that share the same deal_id (true multi-day production).
  // Don't use project_id alone — the default "Production" project is a workspace-wide
  // bucket that contains ALL events, not just related ones.
  const { data: currentEvent } = await supabase
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', eventId)
    .maybeSingle();

  // Only look for siblings if the event has a deal_id
  if (!currentEvent?.deal_id) return null;

  // Find events linked to the same deal (multi-day deals create multiple events)
  const { data: siblings } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at')
    .eq('deal_id', currentEvent.deal_id)
    .order('starts_at', { ascending: true });

  if (!siblings || siblings.length <= 1) return null; // Single event = not multi-day

  // Find the user's crew_assignments for each sibling event
  const siblingIds = siblings.map(s => s.id);
  const { data: assignments } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, event_id')
    .eq('entity_id', entityId)
    .in('event_id', siblingIds);

  const assignmentMap = new Map<string, string>();
  if (assignments) {
    for (const a of assignments) assignmentMap.set(a.event_id, a.id);
  }

  return siblings.map(s => ({
    eventId: s.id,
    title: s.title,
    startsAt: s.starts_at,
    assignmentId: assignmentMap.get(s.id) ?? null,
    isCurrentEvent: s.id === eventId,
  }));
}

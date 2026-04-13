'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface OpenPosition {
  assignmentId: string;
  eventId: string;
  eventTitle: string | null;
  role: string;
  startsAt: string | null;
  endsAt: string | null;
  venueName: string | null;
  payRate: number | null;
  payRateType: string | null;
  scheduledHours: number | null;
}

/**
 * Fetch open (unclaimed) crew positions in the employee's workspace.
 * These are crew_assignments with entity_id IS NULL and a future event date.
 */
export async function getOpenPositions(workspaceId: string): Promise<OpenPosition[]> {
  const supabase = await createClient();

  const { data: rows, error } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, event_id, role, pay_rate, pay_rate_type, scheduled_hours')
    .eq('workspace_id', workspaceId)
    .is('entity_id', null)
    .in('status', ['requested', 'confirmed']);

  if (error || !rows || rows.length === 0) return [];

  // Fetch event details for these assignments
  const eventIds = [...new Set(rows.map(r => r.event_id))];
  const { data: events } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name')
    .in('id', eventIds)
    .gte('starts_at', new Date().toISOString());

  if (!events || events.length === 0) return [];

  const eventMap = new Map(events.map(e => [e.id, e]));

  return rows
    .filter(r => eventMap.has(r.event_id))
    .map(r => {
      const evt = eventMap.get(r.event_id)!;
      return {
        assignmentId: r.id,
        eventId: r.event_id,
        eventTitle: evt.title,
        role: r.role,
        startsAt: evt.starts_at,
        endsAt: evt.ends_at,
        venueName: evt.venue_name,
        payRate: r.pay_rate,
        payRateType: r.pay_rate_type,
        scheduledHours: r.scheduled_hours,
      };
    })
    .sort((a, b) => {
      if (!a.startsAt) return 1;
      if (!b.startsAt) return -1;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
}

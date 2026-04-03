'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type CrewScheduleEntry = {
  assignment_id: string;
  event_id: string;
  role: string;
  status: 'requested' | 'confirmed' | 'dispatched';
  event_title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  venue_address: string | null;
  location_address: string | null;
  deal_id: string | null;
  pay_rate: number | null;
  pay_rate_type: string | null;
  scheduled_hours: number | null;
  event_archetype: string | null;
};

export async function getEntityCrewSchedule(entityId: string): Promise<CrewScheduleEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('entity_crew_schedule')
    .select('assignment_id, event_id, role, status, event_title, starts_at, ends_at, venue_name, venue_address, location_address, deal_id, pay_rate, pay_rate_type, scheduled_hours, event_archetype')
    .eq('entity_id', entityId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('[ops] getEntityCrewSchedule:', error.message);
    return [];
  }

  return (data ?? []) as CrewScheduleEntry[];
}

/**
 * Returns past confirmed/dispatched crew assignments for this entity.
 * Excludes 'requested' status — historical requests that were never confirmed
 * are not meaningful history.
 */
export async function getEntityCrewHistory(entityId: string): Promise<CrewScheduleEntry[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('entity_crew_schedule')
    .select('assignment_id, event_id, role, status, event_title, starts_at, ends_at, venue_name, venue_address, location_address, deal_id, pay_rate, pay_rate_type, scheduled_hours, event_archetype')
    .eq('entity_id', entityId)
    .lt('starts_at', new Date().toISOString())
    .in('status', ['confirmed', 'dispatched'])
    .order('starts_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[ops] getEntityCrewHistory:', error.message);
    return [];
  }

  return (data ?? []) as CrewScheduleEntry[];
}

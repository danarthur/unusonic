'use server';

import {
  getEventSummary as getEventSummaryEntity,
  type EventSummary as EntityEventSummary,
  type RunOfShowData,
} from '@/entities/event/api/get-event-summary';

/** Event summary for Prism Plan/Ledger lenses and Event Studio. Same shape as entity EventSummary. */
export type EventSummaryForPrism = {
  title: string | null;
  client_name: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  location_address: string | null;
  venue_entity_id: string | null;
  deal_id: string | null;
  /** Aliases for location_name / location_address — used by PlanVitalsRow. Populated from location_name / location_address. */
  venue_name?: string | null;
  venue_address?: string | null;
  run_of_show_data: RunOfShowData | null;
  show_day_contacts: { role: string; name: string; phone: string | null; email: string | null }[] | null;
};

export type { RunOfShowData };

export async function getEventSummaryForPrism(
  eventId: string
): Promise<EventSummaryForPrism | null> {
  const summary = await getEventSummaryEntity(eventId);
  if (!summary) return null;
  const s = summary as EntityEventSummary;
  return {
    title: s.title,
    client_name: s.client_name,
    starts_at: s.starts_at,
    ends_at: s.ends_at ?? null,
    location_name: s.location_name,
    location_address: s.location_address,
    venue_entity_id: s.venue_entity_id ?? null,
    deal_id: s.deal_id ?? null,
    venue_name: s.location_name,
    venue_address: s.location_address,
    run_of_show_data: s.run_of_show_data ?? null,
    show_day_contacts: s.show_day_contacts ?? null,
  };
}

/** Lightweight fetch of just load-in/load-out dates for the timeline widget. */
export async function getEventLoadDates(eventId: string): Promise<{ loadIn: string | null; loadOut: string | null }> {
  const { createClient } = await import('@/shared/api/supabase/server');
  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('events')
    .select('dates_load_in, dates_load_out')
    .eq('id', eventId)
    .maybeSingle();
  if (!data) return { loadIn: null, loadOut: null };
  return {
    loadIn: (data as Record<string, unknown>).dates_load_in as string | null ?? null,
    loadOut: (data as Record<string, unknown>).dates_load_out as string | null ?? null,
  };
}

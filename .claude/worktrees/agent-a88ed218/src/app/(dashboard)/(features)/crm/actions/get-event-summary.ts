'use server';

import {
  getEventSummary as getEventSummaryEntity,
  type EventSummary as EntityEventSummary,
  type RunOfShowData,
} from '@/entities/event/api/get-event-summary';

/** Event summary for Prism Plan/Ledger lenses. Same shape as entity EventSummary. */
export type EventSummaryForPrism = {
  title: string | null;
  client_name: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  location_address: string | null;
  run_of_show_data: RunOfShowData | null;
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
    run_of_show_data: s.run_of_show_data ?? null,
  };
}

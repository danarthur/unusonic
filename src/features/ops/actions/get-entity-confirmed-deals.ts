'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface ConfirmedDealGig {
  dealCrewId: string;
  dealId: string;
  role: string | null;
  proposedDate: string | null;
  eventArchetype: string | null;
  dealTitle: string | null;
  venueName: string | null;
  eventId: string | null;
  /** crew_assignment ID if the event has one for this entity — enables full gig detail page */
  assignmentId: string | null;
}

/**
 * Fetch confirmed deal_crew rows for a person entity where the deal
 * either has no event yet (pre-handoff) or the event's crew_assignments
 * don't include this entity (handoff didn't sync crew).
 *
 * These are "booked shows" that haven't materialized into crew_assignments yet.
 */
export async function getEntityConfirmedDeals(entityId: string): Promise<ConfirmedDealGig[]> {
  const supabase = await createClient();

  // Fetch confirmed, non-declined deal_crew rows
  const { data: rows, error } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id, deal_id, role_note, confirmed_at')
    .eq('entity_id', entityId)
    .not('confirmed_at', 'is', null)
    .is('declined_at', null);

  if (error || !rows || rows.length === 0) return [];

  // Fetch deal info
  const dealIds = [...new Set(rows.map(r => r.deal_id))];
  const { data: deals } = await supabase
    .from('deals')
    .select('id, title, proposed_date, event_archetype, event_id, venue_id')
    .in('id', dealIds)
    .is('archived_at', null);

  if (!deals || deals.length === 0) return [];

  // Fetch venue names for deals with venues
  const venueIds = deals.map(d => d.venue_id).filter(Boolean) as string[];
  const venueMap = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: venues } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', venueIds);
    if (venues) {
      for (const v of venues) venueMap.set(v.id, v.display_name);
    }
  }

  // Check which deals already have crew_assignments for this entity
  const eventIds = deals.map(d => d.event_id).filter(Boolean) as string[];
  const assignedEventIds = new Set<string>();
  const eventToAssignmentId = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: assignments } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .select('id, event_id')
      .eq('entity_id', entityId)
      .in('event_id', eventIds);
    if (assignments) {
      for (const a of assignments) {
        assignedEventIds.add(a.event_id);
        eventToAssignmentId.set(a.event_id, a.id);
      }
    }
  }

  const dealMap = new Map(deals.map(d => [d.id, d]));

  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return rows
    .filter(r => {
      const deal = dealMap.get(r.deal_id);
      if (!deal) return false;
      // Skip if already has a crew_assignment for this event
      if (deal.event_id && assignedEventIds.has(deal.event_id)) return false;
      // Skip past dates — those belong in "Recent shows" via crew_assignments
      if (deal.proposed_date && (deal.proposed_date as string) < now) return false;
      return true;
    })
    .map(r => {
      const deal = dealMap.get(r.deal_id)!;
      return {
        dealCrewId: r.id,
        dealId: r.deal_id,
        role: r.role_note,
        proposedDate: (deal.proposed_date as string) ?? null,
        eventArchetype: (deal.event_archetype as string) ?? null,
        dealTitle: (deal.title as string) ?? null,
        venueName: deal.venue_id ? venueMap.get(deal.venue_id) ?? null : null,
        eventId: (deal.event_id as string) ?? null,
        assignmentId: deal.event_id ? eventToAssignmentId.get(deal.event_id) ?? null : null,
      };
    })
    .sort((a, b) => {
      if (!a.proposedDate) return 1;
      if (!b.proposedDate) return -1;
      return a.proposedDate.localeCompare(b.proposedDate);
    });
}

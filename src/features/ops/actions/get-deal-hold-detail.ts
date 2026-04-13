'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface DealHoldDetail {
  holdId: string;
  dealTitle: string | null;
  role: string | null;
  dayRate: number | null;
  callTime: string | null;
  arrivalLocation: string | null;
  notes: string | null;
  proposedDate: string | null;
  eventStartTime: string | null;
  eventEndTime: string | null;
  eventArchetype: string | null;
  venueName: string | null;
  venueCity: string | null;
  acknowledgedAt: string | null;
  confirmedAt: string | null;
  declinedAt: string | null;
  // Client info (available for confirmed deals)
  clientName: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  dealNotes: string | null;
}

/**
 * Fetch hold detail for portal display.
 * Shows enough info for crew to decide (pay, times, venue area, role).
 * Hides client name and deal value (info asymmetry until confirmed).
 */
export async function getDealHoldDetail(
  holdId: string,
  entityId: string
): Promise<DealHoldDetail | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Verify entity ownership
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('id', entityId)
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return null;

  // Fetch hold with deal info
  const { data: hold } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id, role_note, day_rate, call_time, arrival_location, notes, confirmed_at, declined_at, acknowledged_at, deal_id')
    .eq('id', holdId)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (!hold) return null;

  // Fetch deal for date, times, archetype, venue, client
  const { data: deal } = await supabase
    .from('deals')
    .select('title, proposed_date, event_start_time, event_end_time, event_archetype, venue_id, organization_id, main_contact_id, notes')
    .eq('id', hold.deal_id)
    .maybeSingle();

  // Fetch venue, client org, and contact in parallel
  let venueName: string | null = null;
  let venueCity: string | null = null;
  let clientName: string | null = null;
  let contactName: string | null = null;
  let contactPhone: string | null = null;
  let contactEmail: string | null = null;

  if (deal) {
    const [venueResult, orgResult, contactResult] = await Promise.all([
      deal.venue_id
        ? supabase.schema('directory').from('entities').select('display_name, attributes').eq('id', deal.venue_id).maybeSingle()
        : Promise.resolve({ data: null }),
      deal.organization_id && hold.confirmed_at
        ? supabase.schema('directory').from('entities').select('display_name').eq('id', deal.organization_id).maybeSingle()
        : Promise.resolve({ data: null }),
      deal.main_contact_id && hold.confirmed_at
        ? supabase.schema('directory').from('entities').select('display_name, attributes').eq('id', deal.main_contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (venueResult.data) {
      venueName = venueResult.data.display_name;
      const attrs = (venueResult.data.attributes ?? {}) as Record<string, unknown>;
      venueCity = (attrs.city as string) ?? (attrs.state as string) ?? null;
    }
    if (orgResult.data) {
      clientName = orgResult.data.display_name;
    }
    if (contactResult.data) {
      contactName = contactResult.data.display_name;
      const cAttrs = (contactResult.data.attributes ?? {}) as Record<string, unknown>;
      contactPhone = (cAttrs.phone as string) ?? null;
      contactEmail = (cAttrs.email as string) ?? null;
    }
  }

  return {
    holdId: hold.id,
    dealTitle: hold.confirmed_at ? ((deal?.title as string) ?? null) : null, // Only show title if confirmed
    role: hold.role_note,
    dayRate: hold.day_rate ? Number(hold.day_rate) : null,
    callTime: hold.call_time,
    arrivalLocation: hold.arrival_location,
    notes: hold.notes,
    proposedDate: (deal?.proposed_date as string) ?? null,
    eventStartTime: (deal?.event_start_time as string) ?? null,
    eventEndTime: (deal?.event_end_time as string) ?? null,
    eventArchetype: (deal?.event_archetype as string) ?? null,
    venueName,
    venueCity,
    acknowledgedAt: hold.acknowledged_at,
    confirmedAt: hold.confirmed_at,
    declinedAt: hold.declined_at,
    clientName,
    contactName,
    contactPhone,
    contactEmail,
    dealNotes: hold.confirmed_at ? ((deal?.notes as string) ?? null) : null,
  };
}

/**
 * Event entity – lightweight summary for Run of Show header.
 * Reads from ops.events; workspace-scoped via project join.
 */

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';

/** Named call time slot stored in run_of_show_data.call_time_slots[]. */
export type CallTimeSlot = {
  id: string;
  label: string;
  time: string; // "HH:MM" 24h local time
};

/** Transport vehicle mode. `none` = crew is self-equipped, no company vehicle needed. */
export type TransportMode = 'none' | 'personal_vehicle' | 'company_van' | 'rental_truck';

/** Transport status — varies by mode; see VAN_STATUS_FLOW / RENTAL_STATUS_FLOW in plan-vitals-row. */
export type TransportStatus =
  | 'pending'
  | 'loading'
  | 'dispatched'
  | 'on_site'
  | 'returning'
  | 'complete'
  | 'pending_rental'
  | 'truck_picked_up'
  | 'truck_returned';

/** run_of_show_data from ops.events (JSONB). Used by Plan lens flight checks and conflict detection. */
export type RunOfShowData = {
  crew_roles?: string[] | null;
  crew_items?: {
    role: string;
    status: 'requested' | 'confirmed' | 'dispatched';
    entity_id?: string | null;
    assignee_name?: string | null;
  }[] | null;
  gear_requirements?: string | null;
  gear_items?: { id: string; name: string; quantity?: number; status: string; catalog_package_id?: string | null; is_sub_rental?: boolean | null; history?: { status: string; changed_at: string; changed_by: string }[] }[] | null;
  venue_restrictions?: string | null;
  logistics?: { venue_access_confirmed?: boolean; truck_loaded?: boolean; crew_confirmed?: boolean; transport_mode?: TransportMode | null; transport_status?: TransportStatus | null } | null;
  call_time_slots?: CallTimeSlot[] | null;
  call_time_override?: string | null;
  transport_mode?: TransportMode | null;
  transport_status?: TransportStatus | null;
  [key: string]: unknown;
};

export type EventSummary = {
  title: string | null;
  client_name: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  location_address: string | null;
  venue_entity_id: string | null;
  /** Resolved venue display name from `directory.entities.display_name` when `venue_entity_id` is set. Falls back through `location_name` → `location_address` for headers. */
  venue_name: string | null;
  deal_id: string | null;
  run_of_show_data: RunOfShowData | null;
  show_day_contacts: { role: string; name: string; phone: string | null; email: string | null }[] | null;
  guest_count_expected: number | null;
  guest_count_actual: number | null;
  tech_requirements: Record<string, unknown> | null;
  logistics_dock_info: string | null;
  logistics_power_info: string | null;
  /** Canonical show-lifecycle state: 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'archived'. Read by computeEventLock. */
  status: string | null;
  /** Set by markShowStarted when the PM explicitly starts the show. Null until then. */
  show_started_at: string | null;
  /** Set by markShowEnded when the PM explicitly ends the show. Null until then. */
  show_ended_at: string | null;
  /** Pass 3 Phase 4: set by markShowWrapped on close-out. Null = event is still in active piles. */
  archived_at: string | null;
};

export async function getEventSummary(eventId: string): Promise<EventSummary | null> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const workspaceId = membership?.workspace_id ?? null;
  if (!workspaceId) return null;

  let row: Record<string, unknown> | null = null;
  try {
    const res = await supabase
      .schema('ops')
      .from('events')
      .select('title, starts_at, ends_at, location_name, location_address, venue_entity_id, deal_id, run_of_show_data, show_day_contacts, client_entity_id, guest_count_expected, guest_count_actual, tech_requirements, logistics_dock_info, logistics_power_info, status, show_started_at, show_ended_at, archived_at')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (res.error) {
      console.error('[event] getEventSummary:', res.error.message);
      return null;
    }
    row = res.data as Record<string, unknown> | null;
  } catch (e) {
    console.error('[event] getEventSummary:', e);
    Sentry.captureException(e, { tags: { module: 'event', action: 'getEventSummary' } });
    return null;
  }

  if (!row) return null;

  const r = row;

  // Resolve client + venue display names from directory.entities. Same pattern
  // as the events stream and Aion event-scope prefix — header callers want the
  // human label, not the UUID.
  //
  // Fallback through ops.deal_stakeholders: pre-handoff events created before
  // venue/client columns were wired up still have a deal_id with stakeholder
  // rows. The events listing already does this for the same reason
  // (events/page.tsx:171-172). bill_to → client, venue_contact → venue.
  const dealId = (r.deal_id as string) ?? null;
  let clientEntityId = r.client_entity_id as string | null;
  let venueEntityId = r.venue_entity_id as string | null;

  if ((!clientEntityId || !venueEntityId) && dealId) {
    const { data: stakeholders } = await supabase
      .schema('ops')
      .from('deal_stakeholders')
      .select('role, entity_id, organization_id, is_primary')
      .eq('deal_id', dealId)
      .in('role', ['bill_to', 'venue_contact']);
    const rows = (stakeholders ?? []) as { role: string; entity_id: string | null; organization_id: string | null; is_primary: boolean }[];
    const sorted = rows.slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    if (!clientEntityId) {
      const billTo = sorted.find((s) => s.role === 'bill_to');
      clientEntityId = billTo?.entity_id ?? billTo?.organization_id ?? null;
    }
    if (!venueEntityId) {
      const venueContact = sorted.find((s) => s.role === 'venue_contact');
      venueEntityId = venueContact?.organization_id ?? venueContact?.entity_id ?? null;
    }
  }

  const entityIds = [clientEntityId, venueEntityId].filter((id): id is string => Boolean(id));
  const entityNames = new Map<string, string>();
  if (entityIds.length > 0) {
    const { data: ents } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', entityIds);
    for (const e of ents ?? []) {
      entityNames.set(e.id as string, (e.display_name as string) ?? '');
    }
  }
  const clientName = clientEntityId ? entityNames.get(clientEntityId) ?? null : null;
  const venueName = venueEntityId ? entityNames.get(venueEntityId) ?? null : null;

  return {
    title: (r.title as string) ?? null,
    client_name: clientName,
    starts_at: (r.starts_at as string) ?? '',
    ends_at: (r.ends_at as string) ?? null,
    location_name: (r.location_name as string) ?? null,
    location_address: (r.location_address as string) ?? null,
    venue_entity_id: venueEntityId,
    venue_name: venueName,
    deal_id: dealId,
    run_of_show_data: (r.run_of_show_data as RunOfShowData) ?? null,
    show_day_contacts: (r.show_day_contacts as EventSummary['show_day_contacts']) ?? null,
    guest_count_expected: (r.guest_count_expected as number) ?? null,
    guest_count_actual: (r.guest_count_actual as number) ?? null,
    tech_requirements: (r.tech_requirements as Record<string, unknown>) ?? null,
    logistics_dock_info: (r.logistics_dock_info as string) ?? null,
    logistics_power_info: (r.logistics_power_info as string) ?? null,
    status: (r.status as string) ?? null,
    show_started_at: (r.show_started_at as string) ?? null,
    show_ended_at: (r.show_ended_at as string) ?? null,
    archived_at: (r.archived_at as string) ?? null,
  };
}

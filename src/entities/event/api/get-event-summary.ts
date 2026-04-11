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
      .select('title, starts_at, ends_at, location_name, location_address, venue_entity_id, deal_id, run_of_show_data, show_day_contacts, client_entity_id, guest_count_expected, guest_count_actual, tech_requirements, logistics_dock_info, logistics_power_info, status, show_started_at, show_ended_at')
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

  // Resolve client name from directory.entities if client_entity_id is set
  let clientName: string | null = null;
  const clientEntityId = r.client_entity_id as string | null;
  if (clientEntityId) {
    const { data: dirEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('id', clientEntityId)
      .maybeSingle();
    clientName = dirEnt?.display_name ?? null;
  }

  return {
    title: (r.title as string) ?? null,
    client_name: clientName,
    starts_at: (r.starts_at as string) ?? '',
    ends_at: (r.ends_at as string) ?? null,
    location_name: (r.location_name as string) ?? null,
    location_address: (r.location_address as string) ?? null,
    venue_entity_id: (r.venue_entity_id as string) ?? null,
    deal_id: (r.deal_id as string) ?? null,
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
  };
}

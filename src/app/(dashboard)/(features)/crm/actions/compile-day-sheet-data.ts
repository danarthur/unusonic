'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { getCallTime, googleMapsUrl } from '../lib/day-sheet-utils';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export type DaySheetCrewMember = {
  name: string;
  role: string | null;
  callTime: string | null;
  phone: string | null;
  email: string | null;
  entityId: string | null;
  /** Freeform gear notes from deal_crew (Phase 1). */
  gearNotes: string | null;
  /** Structured gear items this crew member is bringing (Phase 3 source=crew). */
  bringList: { name: string; quantity: number }[];
};

export type DaySheetData = {
  eventTitle: string;
  eventDate: string;
  venueName: string | null;
  venueAddress: string | null;
  mapsUrl: string | null;
  crewList: DaySheetCrewMember[];
  showDayContacts: { role: string; name: string; phone: string | null; email: string | null }[];
  timeline: { time: string; label: string }[];
  specialNotes: string | null;
  workspaceName: string;
  runOfShowUrl: string;
};

const InputSchema = z.object({
  eventId: z.string().uuid(),
  dealId: z.string().uuid(),
});

/**
 * Compile day sheet data without sending. Shared by preview and send flows.
 */
export async function compileDaySheetData(
  eventId: string,
  dealId: string,
): Promise<DaySheetData | null> {
  const parsed = InputSchema.safeParse({ eventId, dealId });
  if (!parsed.success) return null;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();

  // 1. Fetch event
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not typed in PostgREST client
  const { data: evt } = await supabase
    .schema('ops')
    .from('events')
    .select(
      'title, starts_at, ends_at, location_name, location_address, show_day_contacts, run_of_show_data, dates_load_in, dates_load_out, venue_entity_id, project:projects!inner(workspace_id)',
    )
    .eq('id', parsed.data.eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (!evt) return null;

  const e = evt as Record<string, unknown>;
  const eventTitle = (e.title as string) ?? 'Untitled show';
  const startsAt = e.starts_at as string | null;
  const endsAt = e.ends_at as string | null;
  const locationName = e.location_name as string | null;
  const locationAddress = e.location_address as string | null;
  const showDayContacts =
    ((e.show_day_contacts as { role: string; name: string; phone: string | null; email: string | null }[]) ?? []);
  const rosData = (e.run_of_show_data ?? {}) as Record<string, unknown>;
  const datesLoadIn = e.dates_load_in as string | null;
  const datesLoadOut = e.dates_load_out as string | null;
  const venueRestrictions = (rosData.venue_restrictions as string | null) ?? null;

  // 2. Fetch deal (title fallback)
  const { data: deal } = await supabase
    .from('deals')
    .select('title')
    .eq('id', parsed.data.dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  // 3. Workspace name
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .maybeSingle();

  const workspaceName = (workspace?.name as string) ?? 'Unusonic';

  // 4. Crew with emails and phones
  const { data: crewData } = await supabase.rpc('get_deal_crew_enriched', {
    p_deal_id: parsed.data.dealId,
    p_workspace_id: workspaceId,
  });

  const crewRows = Array.isArray(crewData) ? crewData : crewData ? [crewData] : [];
  const typedCrew = (crewRows as Record<string, unknown>[]).map((r) => ({
    entity_id: (r.entity_id as string | null) ?? null,
    entity_name: (r.entity_name as string | null) ?? null,
    role_note: (r.role_note as string | null) ?? null,
    call_time: (r.call_time as string | null) ?? null,
    gear_notes: (r.gear_notes as string | null) ?? null,
    brings_own_gear: Boolean(r.brings_own_gear),
  }));

  // Resolve emails and phones from directory.entities
  const entityIds = typedCrew.map((r) => r.entity_id).filter((id): id is string => !!id);
  const contactMap = new Map<string, { email: string | null; phone: string | null }>();

  if (entityIds.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, type, attributes')
      .in('id', entityIds);

    for (const ent of (entities ?? []) as { id: string; type: string | null; attributes: unknown }[]) {
      const t = ent.type ?? 'person';
      let email: string | null = null;
      let phone: string | null = null;

      if (t === 'person') {
        email = readEntityAttrs(ent.attributes, 'person').email ?? null;
        phone = readEntityAttrs(ent.attributes, 'person').phone ?? null;
      } else if (t === 'individual') {
        email = readEntityAttrs(ent.attributes, 'individual').email ?? null;
        phone = readEntityAttrs(ent.attributes, 'individual').phone ?? null;
      } else if (t === 'company') {
        email = readEntityAttrs(ent.attributes, 'company').support_email ?? null;
      }

      contactMap.set(ent.id, { email, phone });
    }
  }

  // Fetch crew-sourced event gear items for bring list per crew member
  const crewBringMap = new Map<string, { name: string; quantity: number }[]>();
  {
    const { data: crewGear } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select('name, quantity, supplied_by_entity_id')
      .eq('event_id', parsed.data.eventId)
      .eq('source', 'crew');

    for (const g of (crewGear ?? []) as { name: string; quantity: number; supplied_by_entity_id: string | null }[]) {
      if (!g.supplied_by_entity_id) continue;
      const list = crewBringMap.get(g.supplied_by_entity_id) ?? [];
      list.push({ name: g.name, quantity: g.quantity });
      crewBringMap.set(g.supplied_by_entity_id, list);
    }
  }

  // Build crew list
  const crewList: DaySheetCrewMember[] = typedCrew
    .filter((r) => r.entity_id)
    .map((r) => {
      const contact = r.entity_id ? contactMap.get(r.entity_id) : null;
      return {
        name: r.entity_name ?? 'Unnamed',
        role: r.role_note,
        callTime: r.call_time ?? getCallTime(startsAt),
        phone: contact?.phone ?? null,
        email: contact?.email ?? null,
        entityId: r.entity_id,
        gearNotes: r.brings_own_gear ? r.gear_notes : null,
        bringList: r.entity_id ? (crewBringMap.get(r.entity_id) ?? []) : [],
      };
    });

  // 5. Build timeline
  const timeline: { time: string; label: string }[] = [];
  const fmt = (iso: string | null, label: string) => {
    if (!iso) return;
    const d = new Date(iso);
    timeline.push({
      time: d.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' }),
      label,
    });
  };

  fmt(datesLoadIn, 'Load in');
  // Default call time from starts_at - 2h
  if (startsAt) {
    const ct = new Date(startsAt);
    ct.setHours(ct.getHours() - 2);
    timeline.push({
      time: ct.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' }),
      label: 'Crew call',
    });
  }
  fmt(startsAt, 'Show start');
  fmt(endsAt, 'Show end');
  fmt(datesLoadOut, 'Load out');

  // Sort by time order (approximation via original ISO strings)
  // We leave them in insertion order since they're already chronological

  // 6. Event date formatted
  const eventDate = startsAt
    ? new Date(startsAt).toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : 'TBD';

  const mapsUrl = locationAddress ? googleMapsUrl(locationAddress) : null;
  const runOfShowUrl = `${baseUrl}/events/g/${parsed.data.eventId}`;

  return {
    eventTitle: eventTitle || (deal?.title as string) || 'Untitled show',
    eventDate,
    venueName: locationName,
    venueAddress: locationAddress,
    mapsUrl,
    crewList,
    showDayContacts,
    timeline,
    specialNotes: venueRestrictions,
    workspaceName,
    runOfShowUrl,
  };
}

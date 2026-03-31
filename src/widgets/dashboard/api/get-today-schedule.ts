'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type TodayEvent = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  locationName: string | null;
  lifecycleStatus: string;
  crewFilled: number;
  crewNeeded: number;
  clientName: string | null;
  dealId: string | null;
};

export type NextUpcoming = {
  id: string;
  title: string;
  startsAt: string;
  venueName: string | null;
};

export type TodayScheduleResult = {
  events: TodayEvent[];
  nextEvent: NextUpcoming | null;
};

// =============================================================================
// Server Action
// =============================================================================

export async function getTodaySchedule(): Promise<TodayScheduleResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { events: [], nextEvent: null };

  const supabase = await createClient();

  // Today boundaries in UTC
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayEnd = new Date(todayStart.getTime() + 86_400_000); // +24h

  try {
    // Fetch today's events from ops.events, scoped by workspace
    const { data: eventRows, error: evtErr } = await supabase
      .schema('ops')
      .from('events')
      .select('id, title, starts_at, ends_at, location_name, lifecycle_status, deal_id, venue_entity_id, client_entity_id')
      .eq('workspace_id', workspaceId)
      .gte('starts_at', todayStart.toISOString())
      .lt('starts_at', todayEnd.toISOString())
      .in('lifecycle_status', ['confirmed', 'production', 'live'])
      .order('starts_at', { ascending: true });

    if (evtErr) {
      console.error('[dashboard] getTodaySchedule events:', evtErr.message);
      return { events: [], nextEvent: null };
    }

    const rows = (eventRows ?? []) as {
      id: string;
      title: string | null;
      starts_at: string;
      ends_at: string | null;
      location_name: string | null;
      lifecycle_status: string;
      deal_id: string | null;
      venue_entity_id: string | null;
      client_entity_id: string | null;
    }[];

    // Collect deal IDs and client entity IDs for batch lookups
    const dealIds = [...new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[])];
    const clientEntityIds = [...new Set(rows.map((r) => r.client_entity_id).filter(Boolean) as string[])];
    const venueEntityIds = [...new Set(rows.map((r) => r.venue_entity_id).filter(Boolean) as string[])];

    // Batch fetch crew counts from ops.deal_crew grouped by deal_id
    const crewCountMap = new Map<string, number>();
    if (dealIds.length > 0) {
      const { data: crewRows } = await supabase
        .schema('ops')
        .from('deal_crew')
        .select('deal_id')
        .in('deal_id', dealIds);

      for (const row of (crewRows ?? []) as { deal_id: string }[]) {
        crewCountMap.set(row.deal_id, (crewCountMap.get(row.deal_id) ?? 0) + 1);
      }
    }

    // Batch fetch client names from directory.entities
    const clientNameMap = new Map<string, string>();
    if (clientEntityIds.length > 0) {
      const { data: clients } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', clientEntityIds);

      for (const c of (clients ?? []) as { id: string; display_name: string | null }[]) {
        if (c.display_name) clientNameMap.set(c.id, c.display_name);
      }
    }

    // Batch fetch venue names from directory.entities
    const venueNameMap = new Map<string, string>();
    if (venueEntityIds.length > 0) {
      const { data: venues } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', venueEntityIds);

      for (const v of (venues ?? []) as { id: string; display_name: string | null }[]) {
        if (v.display_name) venueNameMap.set(v.id, v.display_name);
      }
    }

    const events: TodayEvent[] = rows.map((r) => {
      const crewFilled = r.deal_id ? (crewCountMap.get(r.deal_id) ?? 0) : 0;
      return {
        id: r.id,
        title: r.title ?? 'Untitled event',
        startsAt: r.starts_at,
        endsAt: r.ends_at ?? null,
        venueName: r.venue_entity_id ? (venueNameMap.get(r.venue_entity_id) ?? null) : null,
        locationName: r.location_name ?? null,
        lifecycleStatus: r.lifecycle_status,
        crewFilled,
        crewNeeded: crewFilled, // No separate requirement data yet — no gaps shown
        clientName: r.client_entity_id ? (clientNameMap.get(r.client_entity_id) ?? null) : null,
        dealId: r.deal_id ?? null,
      };
    });

    // If no events today, fetch the next upcoming event
    let nextEvent: NextUpcoming | null = null;
    if (events.length === 0) {
      const { data: upcoming } = await supabase
        .schema('ops')
        .from('events')
        .select('id, title, starts_at, venue_entity_id')
        .eq('workspace_id', workspaceId)
        .gte('starts_at', todayEnd.toISOString())
        .in('lifecycle_status', ['confirmed', 'production', 'live'])
        .order('starts_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (upcoming) {
        const u = upcoming as { id: string; title: string | null; starts_at: string; venue_entity_id: string | null };
        let venueName: string | null = null;
        if (u.venue_entity_id) {
          // Check if already fetched; otherwise do a quick lookup
          venueName = venueNameMap.get(u.venue_entity_id) ?? null;
          if (!venueName) {
            const { data: v } = await supabase
              .schema('directory')
              .from('entities')
              .select('display_name')
              .eq('id', u.venue_entity_id)
              .maybeSingle();
            venueName = (v as { display_name: string | null } | null)?.display_name ?? null;
          }
        }

        nextEvent = {
          id: u.id,
          title: u.title ?? 'Untitled event',
          startsAt: u.starts_at,
          venueName,
        };
      }
    }

    return { events, nextEvent };
  } catch (err) {
    console.error('[dashboard] getTodaySchedule unexpected error:', err);
    return { events: [], nextEvent: null };
  }
}

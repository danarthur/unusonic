import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getSystemClient } from '@/shared/api/supabase/system';
import { verifyBridgeTokenFromRequest } from '@/shared/api/bridge/token';
import {
  BridgeProgramSchema,
  projectMoments,
  projectSongPool,
  type BridgeProgram,
} from '@/shared/api/bridge/program';

/**
 * GET /api/bridge/programs?horizon=7d
 *
 * Return upcoming DJ programs for the authenticated Bridge device. Anchors
 * on `ops.deal_crew` (the canonical crew source of truth per CLAUDE.md —
 * `run_of_show_data.crew_items` is legacy) rather than `ops.crew_assignments`,
 * so Bridge sees the same set of shows the DJ sees on their portal Schedule.
 *
 * Pipeline:
 *   deal_crew (confirmed, not declined, for this entity)
 *     → deals (with event_id, not archived)
 *     → ops.events (in horizon, with DJ program data)
 *     → projected BridgeProgram shape (via Zod)
 */
export async function GET(request: Request) {
  const claims = await verifyBridgeTokenFromRequest(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const system = getSystemClient();

  // Parse horizon (default 7 days)
  const url = new URL(request.url);
  const horizonParam = url.searchParams.get('horizon') ?? '7d';
  const horizonDays = parseInt(horizonParam.replace('d', ''), 10) || 7;
  const horizonDate = new Date();
  horizonDate.setDate(horizonDate.getDate() + horizonDays);

  // 1. Confirmed, non-declined deal_crew rows for this entity.
   
  const { data: crewRows, error: crewErr } = await system
    .schema('ops')
    .from('deal_crew')
    .select('id, deal_id, call_time, day_rate')
    .eq('entity_id', claims.personEntityId)
    .not('confirmed_at', 'is', null)
    .is('declined_at', null);

  if (crewErr) {
    console.error('[bridge/programs] deal_crew fetch failed:', crewErr.message);
    return NextResponse.json({ error: 'Failed to fetch crew bookings' }, { status: 500 });
  }

  if (!crewRows || crewRows.length === 0) {
    return NextResponse.json({ programs: [] });
  }

  type CrewRow = { id: string; deal_id: string; call_time: string | null; day_rate: number | null };
  const dealIds = [...new Set((crewRows as CrewRow[]).map((c) => c.deal_id))];
  // Map deal_id → call_time so we can attach it to the program response.
  const callTimeByDeal = new Map<string, string | null>();
  for (const c of crewRows as CrewRow[]) {
    if (!callTimeByDeal.has(c.deal_id)) callTimeByDeal.set(c.deal_id, c.call_time);
  }

  // 2. Resolve deals → event_id + venue.
  const { data: deals, error: dealErr } = await system
    .from('deals')
    .select('id, event_id, venue_id')
    .in('id', dealIds)
    .is('archived_at', null)
    .not('event_id', 'is', null);

  if (dealErr) {
    console.error('[bridge/programs] deals fetch failed:', dealErr.message);
    return NextResponse.json({ error: 'Failed to fetch deals' }, { status: 500 });
  }

  if (!deals || deals.length === 0) {
    return NextResponse.json({ programs: [] });
  }

  type DealRow = { id: string; event_id: string | null; venue_id: string | null };
  const eventIds = (deals as DealRow[])
    .map((d) => d.event_id)
    .filter((id): id is string => id !== null);
  const eventIdToDeal = new Map<string, DealRow>();
  for (const d of deals as DealRow[]) {
    if (d.event_id) eventIdToDeal.set(d.event_id, d);
  }

  // 3. Fetch events in horizon with DJ program data.
   
  const { data: events, error: eventErr } = await system
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, run_of_show_data')
    .in('id', eventIds)
    .gte('starts_at', new Date().toISOString())
    .lte('starts_at', horizonDate.toISOString())
    .order('starts_at', { ascending: true });

  if (eventErr) {
    console.error('[bridge/programs] events fetch failed:', eventErr.message);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }

  type EventRow = {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string | null;
    run_of_show_data: Record<string, unknown> | null;
  };

  // 4. Resolve venue names (optional — tray context).
  const venueIds = (deals as DealRow[])
    .map((d) => d.venue_id)
    .filter((id): id is string => id !== null);
  const venueNameById = new Map<string, string>();
  if (venueIds.length > 0) {
     
    const { data: venues } = await system
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', venueIds);
    if (venues) {
      for (const v of venues as { id: string; display_name: string }[]) {
        venueNameById.set(v.id, v.display_name);
      }
    }
  }

  // 5. Build projected BridgeProgram responses.
  const programs: BridgeProgram[] = [];
  for (const event of (events ?? []) as EventRow[]) {
    const ros = event.run_of_show_data ?? {};
    const moments = projectMoments((ros as Record<string, unknown>).dj_program_moments);
    const songPool = projectSongPool((ros as Record<string, unknown>).dj_song_pool);

    // Skip events with no DJ program data.
    if (moments.length === 0 && songPool.length === 0) continue;

    // Content hash for change detection on the Bridge side.
    const hash = createHash('sha256')
      .update(JSON.stringify({ moments, songPool }))
      .digest('hex');

    const deal = eventIdToDeal.get(event.id);
    const venueName = deal?.venue_id ? venueNameById.get(deal.venue_id) ?? null : null;
    const callTime = deal ? callTimeByDeal.get(deal.id) ?? null : null;

    const program: BridgeProgram = {
      eventId: event.id,
      eventTitle: event.title,
      eventDate: event.starts_at,
      eventEndDate: event.ends_at,
      venueName,
      callTime,
      moments,
      songPool,
      hash,
    };

    // Validate the whole program shape before it goes out on the wire.
    const parsed = BridgeProgramSchema.safeParse(program);
    if (parsed.success) {
      programs.push(parsed.data);
    } else {
      console.warn('[bridge/programs] Dropping malformed program:', parsed.error.issues);
    }
  }

  // 6. Mark this device as having synced (last_sync_at).
  await system
    .from('bridge_device_tokens')
    .update({ last_sync_at: new Date().toISOString() })
    .eq('id', claims.deviceTokenId);

  return NextResponse.json({ programs });
}

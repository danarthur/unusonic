import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { verifyBridgeTokenFromRequest } from '@/shared/api/bridge/token';

/**
 * POST /api/bridge/sync-status
 * Receive a sync status report from the Bridge companion app.
 * Upserts per (device_token_id, event_id) so only the latest sync is kept.
 */
export async function POST(request: Request) {
  const claims = await verifyBridgeTokenFromRequest(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.eventId || typeof body.matchedCount !== 'number') {
    return NextResponse.json({ error: 'Missing required fields: eventId, matchedCount' }, { status: 400 });
  }

  const system = getSystemClient();

  // Ownership check: the device's person entity must be confirmed on a
  // deal_crew row whose deal's event_id matches the reported eventId.
  // This prevents a compromised token from polluting sync status for events
  // the DJ isn't actually assigned to. The deal_crew anchor matches the
  // programs endpoint's source of truth.
  const { data: ownedDeal, error: ownErr } = await system
    .from('deals')
    .select('id')
    .eq('event_id', body.eventId)
    .is('archived_at', null)
    .maybeSingle();

  if (ownErr) {
    console.error('[bridge/sync-status] ownership lookup failed:', ownErr.message);
    return NextResponse.json({ error: 'Failed to validate event' }, { status: 500 });
  }
  if (!ownedDeal) {
    return NextResponse.json({ error: 'Unknown event' }, { status: 404 });
  }

   
  const { count: ownedCount, error: crewErr } = await system
    .schema('ops')
    .from('deal_crew')
    .select('id', { count: 'exact', head: true })
    .eq('entity_id', claims.personEntityId)
    .eq('deal_id', ownedDeal.id)
    .not('confirmed_at', 'is', null)
    .is('declined_at', null);

  if (crewErr) {
    console.error('[bridge/sync-status] deal_crew lookup failed:', crewErr.message);
    return NextResponse.json({ error: 'Failed to validate event' }, { status: 500 });
  }
  if (!ownedCount || ownedCount === 0) {
    return NextResponse.json({ error: 'Event not assigned to this device' }, { status: 403 });
  }

  // Upsert sync status
  const { error } = await system
    .from('bridge_sync_status')
    .upsert(
      {
        device_token_id: claims.deviceTokenId,
        event_id: body.eventId,
        matched_count: body.matchedCount,
        total_count: body.totalCount ?? body.matchedCount + (body.unmatchedSongs?.length ?? 0),
        unmatched_songs: body.unmatchedSongs ?? [],
        bridge_version: body.bridgeVersion ?? null,
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'device_token_id,event_id' },
    );

  if (error) {
    console.error('[bridge/sync-status] Upsert failed:', error.message);
    return NextResponse.json({ error: 'Failed to save sync status' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/bridge/sync-status?eventId={id}
 * Fetch the latest sync status for an event.
 * Used by the portal to display "Synced via Bridge 2 min ago".
 * Authenticates via standard Supabase session (RLS handles access).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId');
  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  }

  // This endpoint is called from the portal (Supabase session auth).
  // RLS on bridge_sync_status ensures the user can only see their own devices' syncs.
  const { createClient } = await import('@/shared/api/supabase/server');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('bridge_sync_status')
    .select('matched_count, total_count, unmatched_songs, bridge_version, synced_at')
    .eq('event_id', eventId)
    .order('synced_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[bridge/sync-status] Fetch failed:', error.message);
    return NextResponse.json({ error: 'Failed to fetch sync status' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ syncStatus: null });
  }

  return NextResponse.json({
    syncStatus: {
      matchedCount: data.matched_count,
      totalCount: data.total_count,
      unmatchedSongs: data.unmatched_songs,
      bridgeVersion: data.bridge_version,
      syncedAt: data.synced_at,
    },
  });
}

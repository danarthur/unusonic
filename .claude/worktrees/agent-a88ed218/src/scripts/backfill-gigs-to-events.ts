/**
 * Backfill: create events for gigs that don't have a corresponding event (gig_id).
 * - Does not delete any existing data.
 * - Uses event_date at 08:00–18:00 (local day, UTC stored as ISO).
 * Run once after migration: npx tsx src/scripts/backfill-gigs-to-events.ts
 * @module scripts/backfill-gigs-to-events
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

/** Map gig status to event_status (events table). */
function gigStatusToEventStatus(
  gigStatus: string | null
): 'planned' | 'confirmed' | 'hold' | 'cancelled' {
  switch (gigStatus) {
    case 'confirmed':
    case 'run_of_show':
      return 'confirmed';
    case 'inquiry':
    case 'proposal':
    case 'contract_sent':
      return 'planned';
    case 'cancelled':
      return 'cancelled';
    case 'hold':
      return 'hold';
    case 'archived':
      return 'planned'; // show on calendar as planned
    default:
      return 'planned';
  }
}

/**
 * Build starts_at for a gig: event_date at 08:00 (local day).
 * Assumes event_date is YYYY-MM-DD or ISO date string; output is ISO for DB.
 */
function startsAtFromEventDate(eventDate: string | null): string {
  if (!eventDate) {
    const d = new Date();
    d.setUTCHours(8, 0, 0, 0);
    return d.toISOString();
  }
  const d = new Date(eventDate);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCHours(8, 0, 0, 0);
    return fallback.toISOString();
  }
  d.setUTCHours(8, 0, 0, 0);
  return d.toISOString();
}

/**
 * Build ends_at for a gig: event_date at 18:00 (local day).
 */
function endsAtFromEventDate(eventDate: string | null): string {
  if (!eventDate) {
    const d = new Date();
    d.setUTCHours(18, 0, 0, 0);
    return d.toISOString();
  }
  const d = new Date(eventDate);
  if (Number.isNaN(d.getTime())) {
    const fallback = new Date();
    fallback.setUTCHours(18, 0, 0, 0);
    return fallback.toISOString();
  }
  d.setUTCHours(18, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  type GigRow = {
    id: string;
    title: string | null;
    status: string | null;
    event_date: string | null;
    workspace_id: string;
    event_location?: string | null;
    location?: string | null;
  };
  // If gigs has event_location or location, add to select above and they will be copied to events.location_name

  // 1. All gigs; include event_location/location if columns exist (copy to events.location_name)
  // Select location/event_location only if your gigs table has them; otherwise remove from select and use location_name: null below
  const { data: gigs, error: gigsError } = await supabase
    .from('gigs')
    .select('id, title, status, event_date, workspace_id, event_location, location')
    .order('event_date', { ascending: true });

  if (gigsError) {
    console.error('Failed to fetch gigs:', gigsError.message);
    process.exit(1);
  }

  const gigsList = (gigs ?? []) as GigRow[];

  if (!gigsList.length) {
    console.log('No gigs found. Nothing to backfill.');
    process.exit(0);
  }

  // 2. Event IDs that already have a gig_id (so we don't duplicate)
  const { data: existingByGigId } = await supabase
    .from('events')
    .select('gig_id')
    .not('gig_id', 'is', null);

  const existingGigIds = new Set(
    (existingByGigId ?? []).map((r: { gig_id: string }) => r.gig_id)
  );

  const orphanGigs = gigsList.filter((g) => !existingGigIds.has(g.id));
  console.log(`Gigs: ${gigsList.length}, already linked: ${existingGigIds.size}, orphans to backfill: ${orphanGigs.length}`);

  if (orphanGigs.length === 0) {
    console.log('No orphan gigs. Done.');
    process.exit(0);
  }

  let inserted = 0;
  let failed = 0;

  for (const gig of orphanGigs) {
    const starts_at = startsAtFromEventDate(gig.event_date ?? null);
    const ends_at = endsAtFromEventDate(gig.event_date ?? null);
    const status = gigStatusToEventStatus(gig.status ?? null);

    const location_name =
      'event_location' in gig && gig.event_location != null
        ? gig.event_location
        : 'location' in gig && gig.location != null
          ? gig.location
          : null;

    const { error: insertError } = await supabase.from('events').insert({
      title: gig.title ?? 'Untitled Gig',
      starts_at,
      ends_at,
      status,
      location_name,
      workspace_id: gig.workspace_id,
      gig_id: gig.id,
    });

    if (insertError) {
      console.warn(`Failed to insert event for gig ${gig.id}:`, insertError.message);
      failed++;
    } else {
      inserted++;
    }
  }

  console.log(`Backfill complete. Inserted: ${inserted}, failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();

'use server';

import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs, type VenueAttrs } from '@/shared/lib/entity-attrs';

// ── Types ────────────────────────────────────────────────────────────────────

export type VenueIntelEntry = {
  eventTitle: string;
  eventDate: string;
  venueNotes: string | null;
  clientFeedback: string | null;
};

export type VenueStaticData = {
  capacity: string | null;
  loadInNotes: string | null;
  powerNotes: string | null;
  parkingNotes: string | null;
  curfew: string | null;
  accessNotes: string | null;
  stageNotes: string | null;
};

export type VenueIntel = {
  staticData: VenueStaticData;
  pastShows: VenueIntelEntry[];
};

// ── Action ───────────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();

/**
 * Fetch venue intelligence: static venue attributes + historical wrap report
 * venue notes from past shows at this venue.
 *
 * RLS-scoped via session client — no explicit workspace_id filter needed.
 */
export async function getVenueIntel(
  venueEntityId: string
): Promise<VenueIntel | null> {
  const parsed = uuidSchema.safeParse(venueEntityId);
  if (!parsed.success) return null;

  const supabase = await createClient();

  // 1. Fetch venue entity attributes
  const { data: venueEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('attributes')
    .eq('id', venueEntityId)
    .maybeSingle();

  if (!venueEntity) return null;

  const attrs = readEntityAttrs(venueEntity.attributes, 'venue');
  const venueOps = attrs.venue_ops;

  const staticData: VenueStaticData = {
    capacity: attrs.capacity != null ? String(attrs.capacity) : null,
    loadInNotes: attrs.load_in_notes ?? null,
    powerNotes: attrs.power_notes ?? null,
    parkingNotes: venueOps?.parking_notes ?? null,
    curfew: venueOps?.curfew ?? null,
    accessNotes: venueOps?.access_notes ?? null,
    stageNotes: attrs.stage_notes ?? null,
  };

  // 2. Fetch past events at this venue with wrap reports
  const { data: pastEvents } = await supabase
    .schema('ops')
    .from('events')
    .select('title, starts_at, wrap_report')
    .eq('venue_entity_id', venueEntityId)
    .not('wrap_report', 'is', null)
    .lt('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: false })
    .limit(10);

  const pastShows: VenueIntelEntry[] = (pastEvents ?? [])
    .map((e) => {
      const wr = e.wrap_report as Record<string, unknown> | null;
      const venueNotes = (wr?.venue_notes as string) || null;
      const clientFeedback = (wr?.client_feedback as string) || null;
      // Skip entries with no useful notes
      if (!venueNotes && !clientFeedback) return null;
      return {
        eventTitle: e.title ?? 'Untitled show',
        eventDate: e.starts_at,
        venueNotes,
        clientFeedback,
      };
    })
    .filter((entry): entry is VenueIntelEntry => entry !== null);

  return { staticData, pastShows };
}

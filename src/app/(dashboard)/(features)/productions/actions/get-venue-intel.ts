'use server';

import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

// ── Types ────────────────────────────────────────────────────────────────────

export type VenueIntelEntry = {
  eventTitle: string;
  eventDate: string;
  venueNotes: string | null;
  clientFeedback: string | null;
};

export type VenueStaticData = {
  // Loading and access
  capacity: string | null;
  dockAddress: string | null;
  dockHours: string | null;
  dockDoorHeight: string | null;
  dockDoorWidth: string | null;
  loadInWindow: string | null;
  loadOutWindow: string | null;
  loadInNotes: string | null;
  freightElevator: string | null;
  forkliftAvailable: string | null;
  accessNotes: string | null;

  // Parking
  parkingNotes: string | null;
  crewParkingNotes: string | null;

  // Stage and technical
  stageNotes: string | null;
  stageWidth: string | null;
  stageDepth: string | null;
  trimHeight: string | null;
  ceilingHeight: string | null;
  riggingType: string | null;
  riggingPointsCount: string | null;
  riggingWeightPerPoint: string | null;
  housePowerAmps: string | null;
  powerVoltage: string | null;
  powerPhase: string | null;
  powerNotes: string | null;
  housePaIncluded: boolean;
  houseLightingIncluded: boolean;

  // Backstage and facilities
  greenRoomCount: string | null;
  greenRoomNotes: string | null;
  dressingRoomCount: string | null;
  productionOffice: string | null;
  cateringKitchen: string | null;
  venueContactName: string | null;
  venueContactPhone: string | null;

  // Compliance and safety
  curfew: string | null;
  noiseOrdinance: string | null;
  unionLocal: string | null;
  weatherExposure: string | null;
  nearestHospital: string | null;
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

  const str = (v: unknown): string | null => (v != null ? String(v) : null);

  const staticData: VenueStaticData = {
    // Loading and access
    capacity: str(attrs.capacity),
    dockAddress: attrs.dock_address ?? null,
    dockHours: attrs.dock_hours ?? null,
    dockDoorHeight: attrs.dock_door_height ?? null,
    dockDoorWidth: attrs.dock_door_width ?? null,
    loadInWindow: attrs.load_in_window ?? null,
    loadOutWindow: attrs.load_out_window ?? null,
    loadInNotes: attrs.load_in_notes ?? null,
    freightElevator: attrs.freight_elevator ?? null,
    forkliftAvailable: attrs.forklift_available ?? null,
    accessNotes: attrs.access_notes ?? null,

    // Parking
    parkingNotes: attrs.parking_notes ?? null,
    crewParkingNotes: attrs.crew_parking_notes ?? null,

    // Stage and technical
    stageNotes: attrs.stage_notes ?? null,
    stageWidth: str(attrs.stage_width),
    stageDepth: str(attrs.stage_depth),
    trimHeight: str(attrs.trim_height),
    ceilingHeight: str(attrs.ceiling_height),
    riggingType: attrs.rigging_type ?? null,
    riggingPointsCount: str(attrs.rigging_points_count),
    riggingWeightPerPoint: str(attrs.rigging_weight_per_point),
    housePowerAmps: str(attrs.house_power_amps),
    powerVoltage: attrs.power_voltage ?? null,
    powerPhase: attrs.power_phase ?? null,
    powerNotes: attrs.power_notes ?? null,
    housePaIncluded: attrs.house_pa_included ?? false,
    houseLightingIncluded: attrs.house_lighting_included ?? false,

    // Backstage and facilities
    greenRoomCount: str(attrs.green_room_count),
    greenRoomNotes: attrs.green_room_notes ?? null,
    dressingRoomCount: str(attrs.dressing_room_count),
    productionOffice: attrs.production_office ?? null,
    cateringKitchen: attrs.catering_kitchen ?? null,
    venueContactName: attrs.venue_contact_name ?? null,
    venueContactPhone: attrs.venue_contact_phone ?? null,

    // Compliance and safety
    curfew: attrs.curfew ?? null,
    noiseOrdinance: attrs.noise_ordinance ?? null,
    unionLocal: attrs.union_local ?? null,
    weatherExposure: attrs.weather_exposure ?? null,
    nearestHospital: attrs.nearest_hospital ?? null,
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

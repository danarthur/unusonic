'use server';

import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { VENUE_ATTR } from '@/features/network-data/model/attribute-keys';

export type VenueOpsData = {
  display_name: string | null;
  venue_type: string | null;
  capacity: number | null;
  parking_notes: string | null;
  dock_hours: string | null;
  access_notes: string | null;
  venue_contact_name: string | null;
  venue_contact_phone: string | null;
};

/**
 * Fetches standing venue ops data from directory.entities.attributes
 * for the read-only reference card in LogisticsFlightCheck.
 *
 * All fields are now read from top-level attributes (promoted from venue_ops).
 */
export async function getVenueOps(
  venueEntityId: string
): Promise<VenueOpsData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name, attributes')
    .eq('id', venueEntityId)
    .eq('type', 'venue')
    .maybeSingle();

  if (error || !data) return null;

  const d = data as { display_name: string | null; attributes: unknown };
  const attrs = readEntityAttrs(d.attributes, 'venue');

  const rawCapacity = attrs[VENUE_ATTR.capacity];
  const capacity = rawCapacity != null ? Number(rawCapacity) : null;

  return {
    display_name: d.display_name ?? null,
    venue_type: attrs[VENUE_ATTR.venue_type] ?? null,
    capacity: Number.isNaN(capacity) ? null : capacity,
    parking_notes: attrs[VENUE_ATTR.parking_notes] ?? null,
    dock_hours: attrs[VENUE_ATTR.dock_hours] ?? null,
    access_notes: attrs[VENUE_ATTR.access_notes] ?? null,
    venue_contact_name: attrs[VENUE_ATTR.venue_contact_name] ?? null,
    venue_contact_phone: attrs[VENUE_ATTR.venue_contact_phone] ?? null,
  };
}

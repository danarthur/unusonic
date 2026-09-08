/**
 * Where an entity is, as a short place string for compact surfaces.
 *
 * Venues carry this three different ways depending on which writer created
 * them -- Google Places fills `formatted_address`, the manual form fills the
 * discrete fields, and a bulk import fills the `address` object -- so all three
 * are read rather than assuming whichever the current form happens to use.
 *
 * A venue's region outranks almost everything else on its card: on a regional
 * wedding circuit, Napa versus Sonoma is the whole decision. Before this, a
 * venue card rendered a MapPin icon -- a picture of the concept of location --
 * exactly where the location belonged.
 *
 * @module entities/directory/model/read-region
 */

import { PERSON_ATTR, COMPANY_ATTR, VENUE_ATTR } from './attribute-keys';

/** "Napa, CA" from a city and a state, either of which may be missing. */
function joinPlace(city: unknown, state: unknown): string | null {
  const parts = [city, state].filter(
    (v): v is string => typeof v === 'string' && v.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(', ') : null;
}

/** City and state off the tail of a full street address, minus any ZIP. */
function placeFromFormatted(formatted: unknown): string | null {
  if (typeof formatted !== 'string') return null;
  const segments = formatted.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  return segments.slice(-2).join(', ').replace(/\s+\d{5}(-\d{4})?$/, '');
}

function readVenueRegion(attrs: Record<string, unknown>): string | null {
  const discrete = joinPlace(attrs[VENUE_ATTR.city], attrs[VENUE_ATTR.state]);
  if (discrete) return discrete;

  const nested = (attrs[VENUE_ATTR.address] as Record<string, unknown> | null) ?? {};
  return joinPlace(nested.city, nested.state) ?? placeFromFormatted(attrs[VENUE_ATTR.formatted_address]);
}

export function readEntityRegion(
  entityType: string | undefined,
  attrs: Record<string, unknown>,
): string | null {
  if (entityType === 'person') {
    const market = attrs[PERSON_ATTR.market];
    return typeof market === 'string' && market.trim() ? market : null;
  }

  if (entityType === 'venue') return readVenueRegion(attrs);

  const companyAddress = (attrs[COMPANY_ATTR.address] as Record<string, unknown> | null) ?? {};
  return joinPlace(companyAddress.city, companyAddress.state);
}

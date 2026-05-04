'use server';

/**
 * getGearFlightBundle — bundled fetch for GearFlightCheck's mount-time data.
 *
 * The Gear card on the Plan tab previously fired up to five separate server
 * actions on mount, each via its own `useEffect`:
 *   1. getEventGearItems(eventId)            — gear items
 *   2. getGearLineageEnabled()               — workspace flag
 *   3. batchGetGearAvailability(...)         — depends on items + dates
 *   4. getCrewEquipmentMatchesForEvent(eventId) — only when items have catalog_package_id
 *   5. getGearDriftForEvent(eventId)         — only when lineage flag is on
 *
 * On Vercel each round-trip pays auth + handler dispatch + Supabase pool
 * acquisition, so five sequential POSTs cascade. Bundling them into one
 * server action collapses five client round-trips into one. The internal
 * Promise.all preserves server-side parallelism.
 *
 * Pattern matches getPlanBundle / getDealLensBundle. Each individual action
 * is preserved — post-mutation single-call refetches (`fetchItems`,
 * `fetchDrift`) keep using them.
 *
 * Used by: GearFlightCheck.tsx initial mount.
 */

import {
  batchGetGearAvailability,
  getCrewEquipmentMatchesForEvent,
  getEventGearItems,
  getGearLineageEnabled,
  type CrewGearMatch,
  type EventGearItem,
  type GearAvailability,
} from './event-gear-items';
import { getGearDriftForEvent } from './gear-drift';
import type { GearDriftReport } from './gear-drift-types';

/** Each fetch is wrapped in its own try/catch so one slow / failing dependency
 *  doesn't reject the whole bundle and force a full retry. The card falls
 *  back to its empty/null state for the failed slice and the rest still
 *  renders. */
async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[gear-flight-bundle] ${label} failed:`, err);
    return fallback;
  }
}

export type GearFlightBundle = {
  items: EventGearItem[];
  /** Map<catalogPackageId, GearAvailability> serialized as tuples — Maps don't
   *  always survive Server Action serialization across Next.js versions, so we
   *  ship plain entries and let the client reconstruct. */
  availability: Array<[string, GearAvailability]>;
  crewMatches: Record<string, CrewGearMatch[]>;
  lineageEnabled: boolean;
  drift: GearDriftReport | null;
};

const EMPTY_BUNDLE: GearFlightBundle = {
  items: [],
  availability: [],
  crewMatches: {},
  lineageEnabled: false,
  drift: null,
};

export async function getGearFlightBundle(
  eventId: string,
  startsAt: string | null,
  endsAt: string | null,
): Promise<GearFlightBundle> {
  if (!eventId) return EMPTY_BUNDLE;

  // Phase 1: items + lineage flag in parallel. crewMatches requires items
  // (we only fetch when at least one has catalog_package_id) so it goes
  // in phase 2 along with availability and drift. Splitting phases is the
  // right shape rather than racing all five — it lets us skip wasted work
  // when the result of phase 1 says "no catalog gear, no need to compute
  // availability or matches."
  const [items, lineageEnabled] = await Promise.all([
    safe('items', getEventGearItems(eventId), [] as EventGearItem[]),
    safe('lineageEnabled', getGearLineageEnabled(), false),
  ]);

  const hasCatalogGear = items.some((i) => i.catalog_package_id);
  const catalogPairs = hasCatalogGear && startsAt && endsAt
    ? items
        .filter((i) => i.catalog_package_id)
        .map((i) => ({
          catalogPackageId: i.catalog_package_id!,
          startDate: startsAt,
          endDate: endsAt,
        }))
    : [];

  const [availabilityMap, crewMatches, drift] = await Promise.all([
    catalogPairs.length > 0
      ? safe('availability', batchGetGearAvailability(catalogPairs), new Map<string, GearAvailability>())
      : Promise.resolve(new Map<string, GearAvailability>()),
    hasCatalogGear
      ? safe('crewMatches', getCrewEquipmentMatchesForEvent(eventId), {} as Record<string, CrewGearMatch[]>)
      : Promise.resolve({} as Record<string, CrewGearMatch[]>),
    lineageEnabled
      ? safe('drift', getGearDriftForEvent(eventId), null as GearDriftReport | null)
      : Promise.resolve(null as GearDriftReport | null),
  ]);

  return {
    items,
    availability: Array.from(availabilityMap.entries()),
    crewMatches,
    lineageEnabled,
    drift,
  };
}

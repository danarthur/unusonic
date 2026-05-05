'use server';

/**
 * getPlanBundle — bundled fetch action for the Plan tab's primary data.
 *
 * The Plan tab previously fired ~8 separate server actions on cold load:
 * gear items, crew rows, event load dates, contract, ledger, gear variance,
 * proposal, public proposal URL. Each one was a fresh round-trip from the
 * client. With ~30 deals in the rail also firing per-card actions, this
 * pushed the page over Vercel's serverless concurrency limit and produced
 * a steady stream of HTTP 503s on production (~40% failure rate observed
 * in network capture, 2026-04-30).
 *
 * Bundling them into one action collapses 8 client round-trips into 1.
 * Internal Promise.all preserves server-side parallelization, so the
 * end-to-end latency stays bounded by the slowest single query.
 *
 * 2026-05-04 extension: bundles a second wave of sidebar reads
 * (venue intel + COI, run-of-show cues + sections, event conflicts) so
 * VenueIntelCard / RunOfShowIndexCard / DispatchSummary's conflict
 * detection can warm-start from the bundle instead of each card firing
 * its own mount-time fetches. Cards still own their queries — bundle just
 * provides the first paint.
 *
 * Pattern mirrors `getDealBundle`. Each individual action is preserved —
 * callers that legitimately need just one resource (background refresh,
 * mutation invalidation, child-component standalone render) keep using the
 * granular actions.
 *
 * Used by: `plan-lens.tsx` initial Plan tab load.
 */

import { getEventGearItems, type EventGearItem } from './event-gear-items';
import { getDealCrew, getDealCrewForEvent, type DealCrewRow } from './deal-crew';
import { getEventLoadDates } from './get-event-summary';
import { getContractForEvent, type ContractForDeal } from './get-contract-for-event';
import { getEventLedger, type EventLedgerDTO } from '@/features/finance/api/get-event-ledger';
import { getGearVariance, type GearVarianceResult } from './get-gear-variance';
import { getProposalForDeal, getProposalPublicUrl } from '@/features/sales/api/proposal-actions';
import type { ProposalWithItems } from '@/features/sales/model/types';
import { getVenueIntel, type VenueIntel } from './get-venue-intel';
import { getCoiStatus, type CoiStatus } from '@/features/network-data/api/entity-document-actions';
import { fetchCues, fetchSections } from './ros';
import type { Cue, Section } from './run-of-show-types';
import { getEventConflicts, type EventConflict } from '@/features/ops/actions/get-event-conflicts';

export type PlanBundle = {
  gearItems: EventGearItem[];
  crew: DealCrewRow[];
  loadDates: { loadIn: string | null; loadOut: string | null };
  contract: ContractForDeal | null;
  ledger: EventLedgerDTO | null;
  gearVariance: GearVarianceResult | null;
  proposal: ProposalWithItems | null;
  proposalPublicUrl: string | null;
  /** Venue intelligence (entity reads + past-show summary). null when no venue. */
  venueIntel: VenueIntel | null;
  /** Venue COI status. null when no venue. */
  coiStatus: CoiStatus | null;
  /** Run-of-show cues + sections. Empty arrays when no event. */
  runOfShow: { cues: Cue[]; sections: Section[] };
  /** Event resource conflicts (overlapping crew/gear). Empty when no event. */
  conflicts: EventConflict[];
};

const EMPTY_LOAD_DATES = { loadIn: null, loadOut: null } as const;

const EMPTY_BUNDLE: PlanBundle = {
  gearItems: [],
  crew: [],
  loadDates: EMPTY_LOAD_DATES,
  contract: null,
  ledger: null,
  gearVariance: null,
  proposal: null,
  proposalPublicUrl: null,
  venueIntel: null,
  coiStatus: null,
  runOfShow: { cues: [], sections: [] },
  conflicts: [],
};

/** Each fetch is wrapped so one slow / failing dependency doesn't reject
 *  the whole bundle and force a full retry. The card falls back to its
 *  empty/null state for the failed slice and the rest still renders. */
async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[plan-bundle] ${label} failed:`, err);
    return fallback;
  }
}

export async function getPlanBundle(
  eventId: string | null,
  dealId: string | null,
  venueEntityId: string | null = null,
): Promise<PlanBundle> {
  if (!eventId && !dealId) return EMPTY_BUNDLE;

  // Crew prefers the dealId path (returns full deal_crew including manual
  // open roles). Falls back to event-scoped fetch when only eventId is set
  // — same precedence as the existing plan-lens fetchCrew callback.
  const crewPromise = dealId
    ? safe('crew', getDealCrew(dealId), [] as DealCrewRow[])
    : eventId
      ? safe('crew', getDealCrewForEvent(eventId), [] as DealCrewRow[])
      : Promise.resolve([] as DealCrewRow[]);

  // Event-scoped reads. Skip the round-trip when eventId is null
  // (pre-handoff deal with no event yet).
  const gearItemsPromise = eventId
    ? safe('gearItems', getEventGearItems(eventId), [] as EventGearItem[])
    : Promise.resolve([] as EventGearItem[]);
  const loadDatesPromise = eventId
    ? safe('loadDates', getEventLoadDates(eventId), { loadIn: null, loadOut: null })
    : Promise.resolve({ loadIn: null, loadOut: null });
  const contractPromise = eventId
    ? safe('contract', getContractForEvent(eventId), null as ContractForDeal | null)
    : Promise.resolve(null as ContractForDeal | null);
  const ledgerPromise = eventId
    ? safe('ledger', getEventLedger(eventId), null as EventLedgerDTO | null)
    : Promise.resolve(null as EventLedgerDTO | null);
  const gearVariancePromise = eventId
    ? safe('gearVariance', getGearVariance(eventId), null as GearVarianceResult | null)
    : Promise.resolve(null as GearVarianceResult | null);
  const cuesPromise = eventId
    ? safe('rosCues', fetchCues(eventId), [] as Cue[])
    : Promise.resolve([] as Cue[]);
  const sectionsPromise = eventId
    ? safe('rosSections', fetchSections(eventId), [] as Section[])
    : Promise.resolve([] as Section[]);
  const conflictsPromise = eventId
    ? safe('conflicts', getEventConflicts(eventId).then((r) => r.conflicts ?? []), [] as EventConflict[])
    : Promise.resolve([] as EventConflict[]);

  // Deal-scoped reads.
  const proposalPromise = dealId
    ? safe('proposal', getProposalForDeal(dealId), null as ProposalWithItems | null)
    : Promise.resolve(null as ProposalWithItems | null);
  const proposalUrlPromise = dealId
    ? safe('proposalPublicUrl', getProposalPublicUrl(dealId), null as string | null)
    : Promise.resolve(null as string | null);

  // Venue-scoped reads. Skip when no venue is linked yet.
  const venueIntelPromise = venueEntityId
    ? safe('venueIntel', getVenueIntel(venueEntityId), null as VenueIntel | null)
    : Promise.resolve(null as VenueIntel | null);
  const coiStatusPromise = venueEntityId
    ? safe('coiStatus', getCoiStatus(venueEntityId), null as CoiStatus | null)
    : Promise.resolve(null as CoiStatus | null);

  const [
    gearItems,
    crew,
    loadDates,
    contract,
    ledger,
    gearVariance,
    proposal,
    proposalPublicUrl,
    venueIntel,
    coiStatus,
    cues,
    sections,
    conflicts,
  ] = await Promise.all([
    gearItemsPromise,
    crewPromise,
    loadDatesPromise,
    contractPromise,
    ledgerPromise,
    gearVariancePromise,
    proposalPromise,
    proposalUrlPromise,
    venueIntelPromise,
    coiStatusPromise,
    cuesPromise,
    sectionsPromise,
    conflictsPromise,
  ]);

  return {
    gearItems: gearItems ?? [],
    crew: crew ?? [],
    loadDates: loadDates ?? EMPTY_LOAD_DATES,
    contract: contract ?? null,
    ledger: ledger ?? null,
    gearVariance: gearVariance ?? null,
    proposal: proposal ?? null,
    proposalPublicUrl: proposalPublicUrl ?? null,
    venueIntel,
    coiStatus,
    runOfShow: { cues: cues ?? [], sections: sections ?? [] },
    conflicts: conflicts ?? [],
  };
}

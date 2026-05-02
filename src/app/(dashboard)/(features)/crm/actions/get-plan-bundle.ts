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

export type PlanBundle = {
  gearItems: EventGearItem[];
  crew: DealCrewRow[];
  loadDates: { loadIn: string | null; loadOut: string | null };
  contract: ContractForDeal | null;
  ledger: EventLedgerDTO | null;
  gearVariance: GearVarianceResult | null;
  proposal: ProposalWithItems | null;
  proposalPublicUrl: string | null;
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
};

export async function getPlanBundle(
  eventId: string | null,
  dealId: string | null,
): Promise<PlanBundle> {
  if (!eventId && !dealId) return EMPTY_BUNDLE;

  // Crew prefers the dealId path (returns full deal_crew including manual
  // open roles). Falls back to event-scoped fetch when only eventId is set
  // — same precedence as the existing plan-lens fetchCrew callback.
  const crewPromise = dealId
    ? getDealCrew(dealId)
    : eventId
      ? getDealCrewForEvent(eventId)
      : Promise.resolve([] as DealCrewRow[]);

  // Event-scoped reads. Skip the round-trip when eventId is null
  // (pre-handoff deal with no event yet).
  const gearItemsPromise = eventId
    ? getEventGearItems(eventId)
    : Promise.resolve([] as EventGearItem[]);
  const loadDatesPromise = eventId
    ? getEventLoadDates(eventId)
    : Promise.resolve({ loadIn: null, loadOut: null });
  const contractPromise = eventId
    ? getContractForEvent(eventId)
    : Promise.resolve(null);
  const ledgerPromise = eventId ? getEventLedger(eventId) : Promise.resolve(null);
  const gearVariancePromise = eventId
    ? getGearVariance(eventId)
    : Promise.resolve(null);

  // Deal-scoped reads.
  const proposalPromise = dealId ? getProposalForDeal(dealId) : Promise.resolve(null);
  const proposalUrlPromise = dealId ? getProposalPublicUrl(dealId) : Promise.resolve(null);

  const [
    gearItems,
    crew,
    loadDates,
    contract,
    ledger,
    gearVariance,
    proposal,
    proposalPublicUrl,
  ] = await Promise.all([
    gearItemsPromise,
    crewPromise,
    loadDatesPromise,
    contractPromise,
    ledgerPromise,
    gearVariancePromise,
    proposalPromise,
    proposalUrlPromise,
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
  };
}

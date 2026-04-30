'use server';

/**
 * getDealLensBundle — bundle action for the deal-lens detail surface.
 *
 * Companion to getDealBundle (which Prism calls for deal scalars + client +
 * stakeholders). Deal-lens has 8+ additional deal-scoped reads that the prior
 * implementation fired as independent useEffect hooks — in dev each round-trip
 * pays ~600ms of proxy.ts auth overhead, so 8 sequential POSTs cascade into a
 * 4-7s wait before the lens fully populates.
 *
 * This bundles them into one server action so the round-trip count drops to
 * one and the per-fetch latency becomes the max of the parallel server-side
 * Promise.all rather than the sum.
 *
 * Pattern matches getDealBundle / getAionCardBundle / getPrismBundle. Each
 * individual action is preserved — callers that need just one (mutation
 * follow-up refetch, etc.) still use them.
 *
 * Used by:
 *   - deal-lens.tsx initial deal load
 */

import { getDealCrew, type DealCrewRow } from './deal-crew';
import { getDealTimeline, type DealTimelineEntry } from './get-deal-timeline';
import { getFollowUpForDeal, type FollowUpQueueItem } from './follow-up-actions';
import { getContractForEvent } from './get-contract-for-event';
import { getEventLoadDates } from './get-event-summary';
import {
  getProposalForDeal,
  getProposalHistoryForDeal,
  getProposalPublicUrl,
  type ProposalHistoryEntry,
} from '@/features/sales/api/proposal-actions';
import type { ProposalWithItems } from '@/features/sales/model/types';

export type DealLensBundle = {
  timeline: DealTimelineEntry[];
  proposal: ProposalWithItems | null;
  proposalHistory: ProposalHistoryEntry[];
  proposalPublicUrl: string | null;
  crew: DealCrewRow[];
  followUp: FollowUpQueueItem | null;
  contract: Awaited<ReturnType<typeof getContractForEvent>>;
  eventDates: { loadIn: string | null; loadOut: string | null };
};

/** Run a fetch with a per-call try/catch so one slow / failing dependency
 *  doesn't reject Promise.all and force a full bundle retry. Each section
 *  falls back to its empty/null sentinel and the rest of the lens still
 *  paints. Errors get surfaced via console for the dev server. */
async function safe<T>(label: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[deal-lens-bundle] ${label} failed:`, err);
    return fallback;
  }
}

export async function getDealLensBundle(
  dealId: string,
  eventId: string | null,
): Promise<DealLensBundle> {
  const [
    timeline,
    proposal,
    proposalHistory,
    proposalPublicUrl,
    crew,
    followUp,
    contract,
    eventDates,
  ] = await Promise.all([
    safe('timeline', getDealTimeline(dealId), [] as DealTimelineEntry[]),
    safe('proposal', getProposalForDeal(dealId), null),
    safe(
      'proposalHistory',
      getProposalHistoryForDeal(dealId),
      [] as ProposalHistoryEntry[],
    ),
    safe('proposalPublicUrl', getProposalPublicUrl(dealId), null),
    safe('crew', getDealCrew(dealId), [] as DealCrewRow[]),
    safe('followUp', getFollowUpForDeal(dealId), null),
    eventId
      ? safe('contract', getContractForEvent(eventId), null)
      : Promise.resolve(null),
    eventId
      ? safe('eventDates', getEventLoadDates(eventId), {
          loadIn: null,
          loadOut: null,
        })
      : Promise.resolve({ loadIn: null, loadOut: null }),
  ]);

  return {
    timeline,
    proposal,
    proposalHistory,
    proposalPublicUrl,
    crew,
    followUp,
    contract,
    eventDates,
  };
}

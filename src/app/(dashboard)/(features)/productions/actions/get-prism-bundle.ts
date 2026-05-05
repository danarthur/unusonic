'use server';

/**
 * getPrismBundle — unified bundled fetch for the CRM Prism detail panel.
 *
 * The Prism handles both deal-sourced and event-sourced selections. The two
 * paths used to fan out 2-3 client-server roundtrips each:
 *   - Deal source: getDealBundle, then getEventSummaryForPrism if the deal
 *     has handed over.
 *   - Event source: Promise.all(getEventSummaryForPrism, getDealByEventId),
 *     then getDealStakeholders + getDealClientContext if a linked deal exists.
 *
 * This action collapses every selection into ONE round-trip. Internal
 * Promise.all preserves server-side parallelization. The unified return shape
 * lets the Prism cache by selection id alone — TanStack Query keys cleanly,
 * neighbor prefetch becomes one call per neighbor, and the dim/skeleton
 * transition has a single isFetching signal to drive.
 *
 * Pattern: A4 of perf-patterns.md (bundled-fetch). This is the canonical
 * shape for any list-on-left + detail-on-right surface where the detail can
 * have multiple heterogeneous sources.
 */

import { getDealBundle } from './get-deal-bundle';
import { getDealByEventId, type DealDetail } from './get-deal';
import { getDealClientContext, type DealClientContext } from './get-deal-client';
import { getDealStakeholders, type DealStakeholderDisplay } from './deal-stakeholders';
import { getEventSummaryForPrism, type EventSummaryForPrism } from './get-event-summary';
import { getDealSignals } from './get-deal-signals';
import type { DealSignal } from '../lib/compute-deal-signals';
import { getEventSignals } from './get-event-signals';
import type { EventSignal } from '../lib/compute-event-signals';

export type PrismBundleSource = 'deal' | 'event';

export type PrismBundle = {
  source: PrismBundleSource;
  deal: DealDetail | null;
  client: DealClientContext | null;
  stakeholders: DealStakeholderDisplay[];
  eventSummary: EventSummaryForPrism | null;
  /**
   * Per-deal signal stack — observable facts a production owner would weigh
   * by gut. Card surfaces the top entries; Aion narrates the same set in
   * prose. Empty array when no deal id is available (event-source selection
   * with no linked deal). See lib/compute-deal-signals.ts for the catalog.
   */
  signals: DealSignal[];
  /**
   * Per-event signal stack for the Plan-tab Aion card. Drift / silence /
   * conflict signals that don't duplicate the Show Health / Readiness Ribbon
   * / Advancing Checklist widgets. Empty array when there's no linked event
   * yet (pre-handoff deal). See lib/compute-event-signals.ts for the catalog.
   */
  eventSignals: EventSignal[];
};

export async function getPrismBundle(
  selectedId: string,
  source: PrismBundleSource,
  sourceOrgId: string | null,
): Promise<PrismBundle> {
  if (source === 'deal') {
    const [dealBundle, signals] = await Promise.all([
      getDealBundle(selectedId, sourceOrgId),
      getDealSignals(selectedId),
    ]);
    const eventId = dealBundle.deal?.event_id ?? null;
    const [eventSummary, eventSignals] = eventId
      ? await Promise.all([
          getEventSummaryForPrism(eventId),
          getEventSignals(eventId),
        ])
      : [null, []];
    return {
      source: 'deal',
      deal: dealBundle.deal,
      client: dealBundle.client,
      stakeholders: dealBundle.stakeholders,
      eventSummary,
      signals,
      eventSignals,
    };
  }

  const [eventSummary, linkedDeal, eventSignals] = await Promise.all([
    getEventSummaryForPrism(selectedId),
    getDealByEventId(selectedId),
    getEventSignals(selectedId),
  ]);

  if (!linkedDeal) {
    return {
      source: 'event',
      deal: null,
      client: null,
      stakeholders: [],
      eventSummary,
      signals: [],
      eventSignals,
    };
  }

  const [client, stakeholders, signals] = await Promise.all([
    getDealClientContext(linkedDeal.id, sourceOrgId),
    getDealStakeholders(linkedDeal.id),
    getDealSignals(linkedDeal.id),
  ]);

  return {
    source: 'event',
    deal: linkedDeal,
    client: client ?? null,
    stakeholders: stakeholders ?? [],
    eventSummary,
    signals,
    eventSignals,
  };
}

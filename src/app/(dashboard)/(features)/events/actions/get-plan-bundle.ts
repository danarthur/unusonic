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
 * Phase 1 expansion (2026-05-07, see
 * docs/audits/plan-tab-cold-paint-investigation-2026-05-07.md §3):
 * absorbs the workspace pipeline stages, the advancing checklist (with
 * server-side seed when empty), and the kit-compliance batch keyed off
 * the bundle's crew result. Also gates the close-out fetch to post-event
 * only (the UI already gates rendering, but the server was computing
 * unconditionally). These four moves remove ~5 client round-trips and
 * collapse a cascade of effect refires triggered by reference churn on
 * `crewRows`.
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
import { getCloseOutBundle, type CloseOutBundle } from './get-close-out-bundle';
import {
  getWorkspacePipelineStages,
  type WorkspacePipelineStage,
} from './get-workspace-pipeline-stages';
import {
  getAdvancingChecklist,
  seedAdvancingChecklist,
} from './advancing-checklist';
import type { AdvancingChecklistItem } from '../lib/advancing-checklist-types';
import {
  getKitComplianceBatch,
  type KitComplianceResult,
} from '@/features/talent-management/api/kit-template-actions';

export type PlanBundle = {
  gearItems: EventGearItem[];
  crew: DealCrewRow[];
  loadDates: { loadIn: string | null; loadOut: string | null };
  contract: ContractForDeal | null;
  ledger: EventLedgerDTO | null;
  gearVariance: GearVarianceResult | null;
  proposal: ProposalWithItems | null;
  proposalPublicUrl: string | null;
  closeOut: CloseOutBundle | null;
  /** Workspace pipeline stages (cached server-side, 5min TTL). */
  pipelineStages: WorkspacePipelineStage[];
  /** Advancing checklist for this event. Seeded server-side when empty. */
  advancingChecklist: AdvancingChecklistItem[];
  /**
   * Kit compliance keyed by `${entityId}::${roleTag}` (raw, un-normalized
   * role tag — same convention as `getKitComplianceBatch`, so callers can
   * look up by `row.role_note` directly).
   *
   * Why a Record on the wire and not a Map: `Map` does not serialize across
   * the Server-Action boundary — it deserializes as a plain object on the
   * client and breaks `.get()` lookups. We materialize the Record here and
   * the consumer treats it as a plain index.
   */
  kitComplianceByKey: Record<string, KitComplianceResult | null>;
};

const EMPTY_LOAD_DATES = { loadIn: null, loadOut: null } as const;

const EMPTY_PIPELINE_STAGES: WorkspacePipelineStage[] = [];
const EMPTY_CHECKLIST: AdvancingChecklistItem[] = [];
const EMPTY_KIT_COMPLIANCE: Record<string, KitComplianceResult | null> = {};

const EMPTY_BUNDLE: PlanBundle = {
  gearItems: [],
  crew: [],
  loadDates: EMPTY_LOAD_DATES,
  contract: null,
  ledger: null,
  gearVariance: null,
  proposal: null,
  proposalPublicUrl: null,
  closeOut: null,
  pipelineStages: EMPTY_PIPELINE_STAGES,
  advancingChecklist: EMPTY_CHECKLIST,
  kitComplianceByKey: EMPTY_KIT_COMPLIANCE,
};

export type GetPlanBundleOptions = {
  /**
   * ISO timestamp of the event start (`event.starts_at`). Used to gate the
   * close-out Promise — the UI already gates render on `starts_at < now`,
   * but the server was unconditionally computing the close-out (invoices,
   * crew payables, gear status) for every pre-event Plan paint. Pass null
   * for pre-handoff deals (no event yet).
   */
  eventStartsAt?: string | null;
  /**
   * Event archetype (e.g. 'wedding'). Used when the advancing checklist
   * needs to be seeded server-side. Falls back to the default template.
   */
  archetype?: string | null;
  /**
   * Transport mode from `event.run_of_show_data`. Drives whether the seed
   * includes truck-related items. See `seedAdvancingChecklist`.
   */
  transportMode?: string | null;
};

export async function getPlanBundle(
  eventId: string | null,
  dealId: string | null,
  options: GetPlanBundleOptions = {},
): Promise<PlanBundle> {
  if (!eventId && !dealId) return EMPTY_BUNDLE;

  const { eventStartsAt = null, archetype = null, transportMode = null } = options;

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

  // Close-out (post-event) bundle. Gate at the server: the UI already
  // gates render on `starts_at < now` (plan-lens.tsx ~line 647), but the
  // bundle was computing the close-out unconditionally — 4 inner queries
  // (invoices, accepted proposal, crew payables, gear status) that are
  // irrelevant for any pre-event paint. We honour the same gate here so
  // a 17-days-out deal doesn't pay for the work.
  const isPostEvent = !!eventStartsAt && new Date(eventStartsAt).getTime() < Date.now();
  const closeOutPromise: Promise<CloseOutBundle | null> = eventId && isPostEvent
    ? getCloseOutBundle(eventId, dealId)
    : Promise.resolve(null);

  // Pipeline stages — module-level cached server-side (5min TTL), so this
  // resolves instantly on warm calls. The Plan lens uses it for stage tag
  // lookups (completion indicators, handoff strip).
  const pipelineStagesPromise = getWorkspacePipelineStages().then(
    (result) => result?.stages ?? EMPTY_PIPELINE_STAGES,
  );

  // Advancing checklist — read first, seed if empty. The seed call writes
  // back to `ops.events.advancing_checklist` and returns the seeded items.
  // Moving the seed server-side avoids a second client round-trip and
  // collapses the race window where two concurrent Plan-tab paints (e.g.
  // neighbor prefetch + click prefetch on a brand-new deal) could both
  // try to seed the same row.
  const advancingChecklistPromise: Promise<AdvancingChecklistItem[]> = eventId
    ? (async () => {
        const existing = await getAdvancingChecklist(eventId);
        if (existing.length > 0) return existing;
        // Pre-existing pattern: seed failures are non-fatal (e.g. unknown
        // archetype on a grandfathered deal). Swallow and return empty.
        try {
          return await seedAdvancingChecklist(eventId, archetype, transportMode);
        } catch (err) {
          console.error('[plan-bundle] advancing-checklist seed failed:', err);
          return EMPTY_CHECKLIST;
        }
      })()
    : Promise.resolve(EMPTY_CHECKLIST);

  const [
    gearItems,
    crew,
    loadDates,
    contract,
    ledger,
    gearVariance,
    proposal,
    proposalPublicUrl,
    closeOut,
    pipelineStages,
    advancingChecklist,
  ] = await Promise.all([
    gearItemsPromise,
    crewPromise,
    loadDatesPromise,
    contractPromise,
    ledgerPromise,
    gearVariancePromise,
    proposalPromise,
    proposalUrlPromise,
    closeOutPromise,
    pipelineStagesPromise,
    advancingChecklistPromise,
  ]);

  // Kit compliance — derived from the resolved crew rows. Sequencing this
  // after the first Promise.all (rather than chaining on `crewPromise`)
  // keeps the action's wall-clock dominated by the slowest single query
  // in the first batch; the kit-compliance call only fans out to two more
  // server-side queries (templates + equipment) so the cost is small.
  const kitPairs = (crew ?? [])
    .filter((r): r is DealCrewRow & { entity_id: string; role_note: string } =>
      !!r.entity_id && !!r.role_note,
    )
    .map((r) => ({ entityId: r.entity_id, roleTag: r.role_note }));
  let kitComplianceByKey: Record<string, KitComplianceResult | null> = EMPTY_KIT_COMPLIANCE;
  if (kitPairs.length > 0) {
    const map = await getKitComplianceBatch(kitPairs);
    // Map -> Record for the wire (server actions serialize via the
    // Next.js boundary; Map round-trips as `{}`).
    kitComplianceByKey = Object.fromEntries(map);
  }

  return {
    gearItems: gearItems ?? [],
    crew: crew ?? [],
    loadDates: loadDates ?? EMPTY_LOAD_DATES,
    contract: contract ?? null,
    ledger: ledger ?? null,
    gearVariance: gearVariance ?? null,
    proposal: proposal ?? null,
    proposalPublicUrl: proposalPublicUrl ?? null,
    closeOut: closeOut ?? null,
    pipelineStages: pipelineStages ?? EMPTY_PIPELINE_STAGES,
    advancingChecklist: advancingChecklist ?? EMPTY_CHECKLIST,
    kitComplianceByKey,
  };
}

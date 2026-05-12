'use server';

/**
 * getPlanLensExtras — second bundled fetch for the Plan tab's ambient cards.
 *
 * The original `getPlanBundle` collapsed the primary blocking data (crew,
 * gear, ledger, proposal, close-out) into one round-trip. But sibling cards
 * on the Plan tab — Advancing checklist, Venue intel, Run-of-show index,
 * Deal diary, Production captures, conflict detection, gear lineage flag,
 * gear drift, crew-gear matches — still fired their own server actions on
 * mount. With ~11 independent calls per Plan tab paint and Next.js dev
 * serializing server actions, cumulative wall-clock was the bottleneck even
 * after the primary bundle landed.
 *
 * This action bundles the 9 ambient reads into one round-trip. Each card
 * accepts the bundled slice as an optional prop; if undefined the card
 * falls back to its standalone fetch (so VenueIntelCard / RunOfShowIndexCard
 * etc. remain usable outside the Plan tab).
 *
 * Pattern: same as `getPlanBundle`. Internal `Promise.all` preserves
 * server-side parallelization; client-side this is a single TanStack Query
 * that fires in parallel with `getPlanBundle`.
 *
 * Used by: `plan-lens.tsx` initial Plan tab load.
 */

import {
  getAdvancingChecklist,
} from './advancing-checklist';
import type { AdvancingChecklistItem } from '../lib/advancing-checklist-types';
import { getEventConflicts, type EventConflict } from '@/features/ops/actions/get-event-conflicts';
import { getGearLineageEnabled } from './event-gear-items/lineage-flag';
import { getCrewEquipmentMatchesForEvent } from './event-gear-items/crew-source';
import type { CrewGearMatch } from './event-gear-items/types';
import { getGearDriftForEvent } from './gear-drift';
import type { GearDriftReport } from './gear-drift-types';
import { getVenueIntel, type VenueIntel } from './get-venue-intel';
import { getCoiStatus, type CoiStatus } from '@/features/network-data/api/entity-document-actions';
import { fetchCues, fetchSections } from './ros';
import type { Cue, Section } from './run-of-show-types';
import { getDealNotes, type DealNoteEntry, type PhaseTag } from './deal-notes';
import {
  getProductionCaptures,
  type GetProductionCapturesResult,
} from '@/widgets/network-detail/api/get-production-captures';

export type PlanLensExtras = {
  advancingChecklist: AdvancingChecklistItem[];
  eventConflicts: EventConflict[];
  gearLineageEnabled: boolean;
  crewEquipmentMatches: Record<string, CrewGearMatch[]>;
  gearDrift: GearDriftReport | null;
  /** Null when the event has no venue_entity_id. */
  venue: { intel: VenueIntel | null; coi: CoiStatus | null } | null;
  runOfShow: { cues: Cue[]; sections: Section[] };
  dealNotes: DealNoteEntry[];
  productionCaptures: GetProductionCapturesResult;
};

const EMPTY_CAPTURES: GetProductionCapturesResult = { ok: true, captures: [] };

const EMPTY_RUN_OF_SHOW = { cues: [] as Cue[], sections: [] as Section[] };

const EMPTY_BUNDLE: PlanLensExtras = {
  advancingChecklist: [],
  eventConflicts: [],
  gearLineageEnabled: false,
  crewEquipmentMatches: {},
  gearDrift: null,
  venue: null,
  runOfShow: EMPTY_RUN_OF_SHOW,
  dealNotes: [],
  productionCaptures: EMPTY_CAPTURES,
};

export type GetPlanLensExtrasInput = {
  eventId: string | null;
  dealId: string | null;
  workspaceId: string | null;
  /** From `event.venue_entity_id`; the venue cluster is skipped when null. */
  venueEntityId: string | null;
  /** PhaseTag for the diary card. Plan-lens always passes 'plan'. */
  diaryPhaseTag: PhaseTag | null;
};

export async function getPlanLensExtras(
  input: GetPlanLensExtrasInput,
): Promise<PlanLensExtras> {
  const { eventId, dealId, workspaceId, venueEntityId, diaryPhaseTag } = input;

  if (!eventId && !dealId) return EMPTY_BUNDLE;

  // Event-scoped reads. Skip the round-trip when eventId is null.
  const advancingPromise = eventId
    ? getAdvancingChecklist(eventId)
    : Promise.resolve([] as AdvancingChecklistItem[]);

  const conflictsPromise = eventId
    ? getEventConflicts(eventId).then((r) => r.conflicts)
    : Promise.resolve([] as EventConflict[]);

  // Workspace-flag — cheap; same caller across the workspace so the value is
  // identical for every event on a given dashboard session.
  const lineagePromise = getGearLineageEnabled();

  const crewMatchesPromise = eventId
    ? getCrewEquipmentMatchesForEvent(eventId)
    : Promise.resolve({} as Record<string, CrewGearMatch[]>);

  // Drift compute is the heaviest of the bundle (5 internal queries) but it
  // doesn't gate the primary skeleton — it surfaces a ribbon when proposal
  // and gear drift apart. Bundling here lets it run in parallel with the
  // others rather than serializing behind a useEffect.
  const driftPromise = eventId
    ? getGearDriftForEvent(eventId)
    : Promise.resolve(null);

  // Venue cluster — gated on venue_entity_id so we don't pay for two round-
  // trips on events without a venue yet.
  const venuePromise = venueEntityId
    ? Promise.all([
        getVenueIntel(venueEntityId),
        getCoiStatus(venueEntityId),
      ]).then(([intel, coi]) => ({ intel, coi }))
    : Promise.resolve(null);

  const rosPromise = eventId
    ? Promise.all([fetchCues(eventId), fetchSections(eventId)]).then(([cues, sections]) => ({ cues, sections }))
    : Promise.resolve(EMPTY_RUN_OF_SHOW);

  const dealNotesPromise = dealId
    ? getDealNotes(dealId, diaryPhaseTag ?? null)
    : Promise.resolve([] as DealNoteEntry[]);

  // Production captures need the predecessor-deal hint to surface pre-handover
  // sales notes alongside post-handover event captures. Plan-lens passes
  // both eventId (productionId) and dealId (predecessor).
  const capturesPromise =
    workspaceId && eventId
      ? getProductionCaptures(workspaceId, 'event', eventId, {
          includePredecessorDealId: dealId,
        })
      : Promise.resolve(EMPTY_CAPTURES);

  const [
    advancingChecklist,
    eventConflicts,
    gearLineageEnabled,
    crewEquipmentMatches,
    gearDrift,
    venue,
    runOfShow,
    dealNotes,
    productionCaptures,
  ] = await Promise.all([
    advancingPromise,
    conflictsPromise,
    lineagePromise,
    crewMatchesPromise,
    driftPromise,
    venuePromise,
    rosPromise,
    dealNotesPromise,
    capturesPromise,
  ]);

  return {
    advancingChecklist,
    eventConflicts,
    gearLineageEnabled,
    crewEquipmentMatches,
    gearDrift,
    venue,
    runOfShow,
    dealNotes,
    productionCaptures,
  };
}

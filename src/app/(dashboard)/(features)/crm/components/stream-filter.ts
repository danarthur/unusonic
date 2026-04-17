/**
 * Pure filter logic for the Stream tabs (Inquiry / Active / Past).
 *
 * Extracted from stream.tsx so it can be unit-tested without pulling in
 * React/framer-motion. Phase 3h (docs/reference/custom-pipelines-design.md §9.6).
 *
 * Tab semantics:
 *   Inquiry : deals in kind='working' stages tagged initial_contact OR
 *             proposal_sent. Past-dated inquiries drop out.
 *   Active  : events (non-archived, non-cancelled, future) + deals in
 *             kind='won' OR in working stages past proposal_sent (i.e. tagged
 *             contract_out / contract_signed / deposit_received / etc.). Won
 *             deals with past dates slide into Past, not Active.
 *   Past    : cancelled events / past-dated events / deals kind='lost' /
 *             won deals past their date / any past-dated working deal.
 *
 * Custom-renamed workspaces: the tags are the stable identity, so renaming
 * "Proposal" to "Pitch" keeps the Inquiry bucket correct as long as the new
 * stage still carries the proposal_sent tag.
 *
 * Fallback: when a deal's stage_id can't be resolved against the provided
 * pipelineStages (bad data or stages missing), the filter falls back to the
 * legacy status-slug check so no deal silently disappears.
 */

import type { StreamCardItem } from './stream-card';
import type { WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';
import { readEventStatusFromLifecycle } from '@/shared/lib/event-status/read-event-status';

export type StreamMode = 'inquiry' | 'active' | 'past';

/** Tags that define the Inquiry bucket. Every working stage NOT tagged with
 *  one of these falls into Active. */
const INQUIRY_TAGS = ['initial_contact', 'proposal_sent'] as const;

/** Legacy fallback slug sets — used only when stage lookup fails. Kept in
 *  sync with the tags above for stock-seeded workspaces. */
const LEGACY_INQUIRY_SLUGS = new Set(['inquiry', 'proposal']);
const LEGACY_ACTIVE_DEAL_SLUGS = new Set(['contract_sent', 'contract_signed', 'deposit_received']);
const LEGACY_PAST_PRE_HANDOVER_SLUGS = new Set([
  'inquiry', 'proposal', 'contract_sent', 'contract_signed', 'deposit_received',
]);

export type StageLookup = {
  /** stage_id → { kind, tags } */
  byId: Map<string, { kind: 'working' | 'won' | 'lost'; tags: readonly string[] }>;
  /** stage ids whose tags include any of INQUIRY_TAGS */
  inquiryStageIds: Set<string>;
  /** stage ids with kind='working' and NOT in inquiryStageIds (contract_out onward) */
  activeWorkingStageIds: Set<string>;
};

export function buildStageLookup(stages: readonly WorkspacePipelineStage[]): StageLookup {
  const byId = new Map<string, { kind: 'working' | 'won' | 'lost'; tags: readonly string[] }>();
  const inquiryStageIds = new Set<string>();
  const activeWorkingStageIds = new Set<string>();

  for (const s of stages) {
    byId.set(s.id, { kind: s.kind, tags: s.tags });
    const hasInquiryTag = INQUIRY_TAGS.some((t) => s.tags.includes(t));
    if (hasInquiryTag) {
      inquiryStageIds.add(s.id);
    } else if (s.kind === 'working') {
      activeWorkingStageIds.add(s.id);
    }
  }

  return { byId, inquiryStageIds, activeWorkingStageIds };
}

/**
 * Resolve a deal item's stage bucket. Returns null when stage_id is missing
 * or not in the lookup — caller falls back to legacy slug checks.
 */
export function classifyDealStage(
  item: StreamCardItem,
  lookup: StageLookup,
): 'inquiry' | 'active' | 'won' | 'lost' | null {
  if (!item.stage_id) return null;
  const meta = lookup.byId.get(item.stage_id);
  if (!meta) return null;
  if (meta.kind === 'won') return 'won';
  if (meta.kind === 'lost') return 'lost';
  // kind === 'working'
  if (lookup.inquiryStageIds.has(item.stage_id)) return 'inquiry';
  return 'active';
}

export function filterByMode(
  items: StreamCardItem[],
  mode: StreamMode,
  pipelineStages: readonly WorkspacePipelineStage[] = [],
  /** Optional injected "today" for deterministic tests (YYYY-MM-DD). */
  nowIso?: string,
): StreamCardItem[] {
  const today = nowIso ?? new Date().toISOString().slice(0, 10);
  const lookup = buildStageLookup(pipelineStages);

  if (mode === 'inquiry') {
    return items.filter((i) => {
      if (i.source !== 'deal') return false;
      if (i.event_date != null && i.event_date < today) return false;
      const bucket = classifyDealStage(i, lookup);
      if (bucket) return bucket === 'inquiry';
      return LEGACY_INQUIRY_SLUGS.has(i.status ?? '');
    });
  }

  if (mode === 'active') {
    return items.filter((i) => {
      if (i.source === 'event') {
        return (
          i.archived_at == null &&
          readEventStatusFromLifecycle(i.lifecycle_status) !== 'cancelled' &&
          (i.event_date == null || i.event_date >= today)
        );
      }
      // Deal path — future-dated only.
      if (i.event_date != null && i.event_date < today) return false;
      const bucket = classifyDealStage(i, lookup);
      if (bucket) {
        return bucket === 'active' || bucket === 'won';
      }
      return (
        LEGACY_ACTIVE_DEAL_SLUGS.has(i.status ?? '') ||
        i.status === 'won'
      );
    });
  }

  if (mode === 'past') {
    return items.filter((i) => {
      const eventPhase = i.source === 'event' ? readEventStatusFromLifecycle(i.lifecycle_status) : null;
      if (i.source === 'event') {
        if (eventPhase === 'cancelled') return true;
        return i.event_date != null && i.event_date < today;
      }
      const bucket = classifyDealStage(i, lookup);
      if (bucket) {
        if (bucket === 'lost') return true;
        if (bucket === 'won') return i.event_date != null && i.event_date < today;
        return i.event_date != null && i.event_date < today;
      }
      if (i.status === 'lost') return true;
      if (i.status === 'won' && i.event_date != null && i.event_date < today) return true;
      if (
        LEGACY_PAST_PRE_HANDOVER_SLUGS.has(i.status ?? '') &&
        i.event_date != null &&
        i.event_date < today
      ) {
        return true;
      }
      return false;
    });
  }

  return items;
}

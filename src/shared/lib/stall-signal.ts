import {
  STALL_STAGE_BY_ORDINAL,
  STALL_STAGE_META,
  type StallableStatus,
} from './pipeline-stages/constants';

export type StallSignal = {
  stalled: boolean;
  daysInStage: number;
  threshold: number;
  urgent: boolean;
  stageName: string;
  suggestion: string;
};

/**
 * Computes whether a deal is stalling in its current pipeline stage.
 * Accepts typed objects (for client-side use in React components).
 */
export function computeStallSignal(
  deal: { created_at: string; proposed_date: string | null },
  proposal: { created_at?: string; updated_at?: string } | null,
  currentStage: number,
): StallSignal | null {
  return computeStallSignalFromRaw({
    status: '', // not used internally — stage is passed directly
    createdAt: deal.created_at,
    proposalCreatedAt: proposal?.created_at ?? null,
    proposalUpdatedAt: proposal?.updated_at ?? null,
    proposedDate: deal.proposed_date,
    currentStage,
  });
}

type ThresholdOverrides = Partial<Record<StallableStatus, number>>;

function pickStageStartMs(
  slug: StallableStatus,
  params: { createdAt: string; proposalCreatedAt: string | null; proposalUpdatedAt: string | null },
): number | null {
  if (slug === 'inquiry') return new Date(params.createdAt).getTime();
  if (slug === 'proposal') {
    return params.proposalCreatedAt ? new Date(params.proposalCreatedAt).getTime() : null;
  }
  return params.proposalUpdatedAt ? new Date(params.proposalUpdatedAt).getTime() : null;
}

function urgentThreshold(base: number, slug: StallableStatus): number {
  // contract_sent floors at 1 to preserve legacy behavior for low overrides;
  // inquiry/proposal match the pre-refactor branches verbatim.
  if (slug === 'contract_sent') return Math.max(1, Math.ceil(base / 2));
  return Math.ceil(base / 2);
}

/**
 * Computes whether a deal is stalling in its current pipeline stage.
 * Accepts scalar params (for server-side cron use).
 *
 * Phase 2c: `stageRottingDaysOverride` — when present (e.g. from the workspace's
 * ops.pipeline_stages.rotting_days column), it replaces the hardcoded
 * STALL_STAGE_META threshold. Same urgent-halving + floor rules apply.
 */
export function computeStallSignalFromRaw(params: {
  status: string;
  createdAt: string;
  proposalCreatedAt: string | null;
  proposalUpdatedAt: string | null;
  proposedDate: string | null;
  currentStage: number;
  thresholdOverrides?: ThresholdOverrides;
  stageRottingDaysOverride?: number | null;
}): StallSignal | null {
  const { proposedDate, currentStage, thresholdOverrides, stageRottingDaysOverride } = params;

  const slug = STALL_STAGE_BY_ORDINAL[currentStage];
  if (!slug) return null;

  const meta = STALL_STAGE_META[slug];
  const now = Date.now();
  const eventDate = proposedDate ? new Date(proposedDate + 'T00:00:00').getTime() : null;
  const daysUntilEvent = eventDate ? Math.ceil((eventDate - now) / 86400000) : null;
  const urgent = daysUntilEvent !== null && daysUntilEvent <= 60;

  // Resolution order: playbook threshold override → workspace stage.rotting_days → hardcoded default.
  const base =
    thresholdOverrides?.[slug]
    ?? (stageRottingDaysOverride != null ? stageRottingDaysOverride : null)
    ?? meta.rottingDays;
  const threshold = urgent ? urgentThreshold(base, slug) : base;

  const stageStartMs = pickStageStartMs(slug, params);
  if (stageStartMs === null) return null;

  const daysInStage = Math.floor((now - stageStartMs) / 86400000);
  if (daysInStage < 0) return null;

  return {
    stalled: daysInStage >= threshold,
    daysInStage,
    threshold,
    urgent,
    stageName: meta.stageName,
    suggestion: meta.suggestion,
  };
}

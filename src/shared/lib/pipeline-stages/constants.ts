/**
 * Default sales-pipeline stage metadata.
 *
 * Phase 0 of the Custom Pipelines project (docs/reference/custom-pipelines-design.md):
 * this module centralizes the stage-specific values that were previously hardcoded as
 * ordinal branches inside stall-signal.ts, follow-up-priority.ts, and the follow-up
 * queue cron. Consolidating them here is a prerequisite for Phase 1 (workspace-owned
 * pipelines) — Phase 2 replaces callers that read from this constant with workspace
 * reads from ops.pipeline_stages.
 *
 * Values below preserve today's production behavior verbatim. Do not tune them here;
 * tune them in Phase 2 via per-stage rotting_days once workspaces can own them.
 */

/**
 * Working-stage slugs that the stall-signal heuristic evaluates. Deals in
 * `contract_signed`, `deposit_received`, `won`, or `lost` are not stall-evaluated
 * — they either have money/signatures in motion or are terminal.
 */
export type StallableStatus = 'inquiry' | 'proposal' | 'contract_sent';

/**
 * Per-stage stall metadata. `rottingDays` is the normal threshold before a deal
 * is considered stalled; when a deal has a proposed_date within 60 days the
 * threshold is halved (see stall-signal.ts).
 */
export const STALL_STAGE_META: Record<StallableStatus, {
  stageOrdinal: 0 | 1 | 2;
  rottingDays: number;
  stageName: string;
  suggestion: string;
}> = {
  inquiry: {
    stageOrdinal: 0,
    rottingDays: 7,
    stageName: 'Inquiry',
    suggestion: 'Build a proposal to move this forward.',
  },
  proposal: {
    stageOrdinal: 1,
    rottingDays: 14,
    stageName: 'Proposal',
    suggestion: 'Send the proposal to the client.',
  },
  contract_sent: {
    stageOrdinal: 2,
    rottingDays: 5,
    stageName: 'Contract sent',
    suggestion: 'Follow up — the client may need a nudge.',
  },
};

/**
 * Reverse lookup: ordinal index → stall-stage slug. Indexed access returns
 * undefined for out-of-range ordinals, matching the pre-refactor semantics
 * where stall-signal.ts returned null for currentStage > 2.
 */
export const STALL_STAGE_BY_ORDINAL: readonly StallableStatus[] = [
  'inquiry',
  'proposal',
  'contract_sent',
];

/**
 * Status slugs considered "open" by the follow-up queue cron — the set of
 * deals evaluated for stall/engagement/proximity signals each run.
 */
export const OPEN_DEAL_STATUSES: readonly StallableStatus[] = [
  'inquiry',
  'proposal',
  'contract_sent',
];

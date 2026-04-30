/**
 * Cadence-accuracy telemetry helper for DealLens.
 *
 * Extracted from deal-lens.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Fires `aion_card_cadence_accuracy` when the AionDealCard's voice referenced
 * cadence personalization AND the owner took an action. See §9 of
 * docs/reference/aion-follow-up-analytics-inventory.md.
 *
 * v1 limitation noted in the prior implementation: we don't yet have the
 * proposal_sent anchor wired through, so `actualDaysElapsed` is a placeholder
 * (0). Refine the anchor in a follow-up; the event still fires so the
 * predicted-window side of the analysis is captured.
 */

import { logAionCardCadenceAccuracy } from '../../actions/aion-card-actions';
import type { AionCardData } from '../../actions/get-aion-card-for-deal';

export async function emitCadenceAccuracyIfPersonalized(
  action: 'draft_nudge' | 'act_nudge' | 'dismiss_nudge' | 'snooze_nudge',
  dealId: string,
  followUpId: string,
  cardData: AionCardData | null,
): Promise<void> {
  if (!cardData) return;
  if (!cardData.voiceSignals?.includes('cadence_exceeded')) return;
  const predicted = cardData.cadence?.typicalDaysProposalToFirstFollowup;
  if (!predicted || predicted <= 0) return;
  const row = cardData.outboundRows.find((r) => r.followUpId === followUpId);
  if (!row) return;
  const actualDaysElapsed = 0; // placeholder until proposal_sent is threaded through
  await logAionCardCadenceAccuracy({
    dealId,
    followUpId,
    predictedWindowDays: predicted,
    actualDaysElapsed,
    action,
  });
}

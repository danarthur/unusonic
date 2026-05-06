/**
 * Stage-gate helpers for inline signal evaluators.
 *
 * Why this exists: signal evaluators (stall, proposal_sent, etc.) read from
 * `ops.follow_up_queue` rows that were written days ago. Once a deal advances
 * past the stage that produced a row, the row's text becomes stale — e.g. a
 * row authored when the deal was in Inquiry still reads "Deal has been in
 * Inquiry for 21 days with no proposal sent" even though the deal is now in
 * Contract Sent. This module filters rows whose `reason_type` no longer
 * matches the deal's current stage tags + status, without touching the row
 * data on disk (the cron rebuilds them on its next run).
 *
 * Pair with `stageOrdinalFromTags()` for `follow-up-priority.ts` — that's
 * the cron-side fix that produces correct rows in the first place. This
 * file is the read-side belt-and-suspenders so even when cron is delayed,
 * the UI doesn't surface a stale prompt.
 *
 * Related audit: 2026-05-05 Round 3 finding "Insight/signal evaluators
 * don't reset when a deal advances stages".
 */

import type { StallableStatus } from './pipeline-stages/constants';

/**
 * Tag-set semantics for the workspace's default pipeline. A stage carries
 * 0+ semantic tags ("initial_contact", "proposal_sent", "contract_out",
 * "deposit_received", "won", "lost") — workspaces can rename labels but
 * the tag is the canonical identifier the rest of the platform reads.
 */
export const STAGE_TAG_INITIAL_CONTACT = 'initial_contact';
export const STAGE_TAG_PROPOSAL_SENT = 'proposal_sent';
export const STAGE_TAG_CONTRACT_OUT = 'contract_out';
export const STAGE_TAG_DEPOSIT_RECEIVED = 'deposit_received';
export const STAGE_TAG_WON = 'won';
export const STAGE_TAG_LOST = 'lost';

/**
 * Maps a stage's tags to the StallableStatus ordinal used by stall-signal.ts.
 * Returns null for stages outside the working pipeline (deposit_received,
 * won, lost) — those don't get stall-evaluated.
 *
 * Tag precedence matches the migration ordering: a stage tagged both
 * `initial_contact` and `proposal_sent` (rare but possible during pipeline
 * editing) falls through to `proposal_sent` since the proposal is the more
 * advanced state.
 */
export function stageOrdinalFromTags(
  tags: readonly string[] | null | undefined,
): { ordinal: 0 | 1 | 2; slug: StallableStatus } | null {
  if (!tags || tags.length === 0) return null;
  if (tags.includes(STAGE_TAG_CONTRACT_OUT)) return { ordinal: 2, slug: 'contract_sent' };
  if (tags.includes(STAGE_TAG_PROPOSAL_SENT)) return { ordinal: 1, slug: 'proposal' };
  if (tags.includes(STAGE_TAG_INITIAL_CONTACT)) return { ordinal: 0, slug: 'inquiry' };
  return null;
}

/**
 * True when a deal's status is `won` or `lost` — those are terminal and
 * should never carry an active sales nudge other than `thank_you`.
 */
export function isTerminalStatus(status: string | null | undefined): boolean {
  return status === 'won' || status === 'lost';
}

/**
 * Each follow-up `reason_type` lives at a specific stage in the working
 * pipeline. Once the deal advances past that stage (or a terminal status
 * is reached), the corresponding queue row is stale even if the cron
 * hasn't yet swept it. Returns the set of stage tags that keep this
 * reason_type relevant; `null` means "any working stage".
 *
 * Routine reasons that don't tie to a single stage (`deadline_proximity`,
 * `no_owner`, `no_activity`, `nudge_client`, `check_in`, `gone_quiet`,
 * `date_hold_pressure`) return null — they only require the deal not be
 * terminal.
 *
 * `thank_you` only fires on won deals and is intentionally excluded from
 * the working-pipeline gate; callers handle it via `isTerminalStatus`.
 */
function requiredStageTags(reasonType: string): readonly string[] | null {
  switch (reasonType) {
    case 'stall':
      // Stall text is hard-bound to the stage at queue-write time
      // ("Deal has been in Inquiry for 21 days…"). Once the deal advances,
      // the text stops matching reality. We can't tell from `reason_type`
      // alone which stage the row was authored for, so we drop the row
      // when the deal advances past `proposal_sent` — a stall in any
      // working stage is legitimate, but a stall that says Inquiry on a
      // contract-stage deal is the audit-finding bug. The cron rebuilds
      // an accurate row on the next run.
      return [
        STAGE_TAG_INITIAL_CONTACT,
        STAGE_TAG_PROPOSAL_SENT,
        STAGE_TAG_CONTRACT_OUT,
      ];
    case 'proposal_sent':
    case 'proposal_unseen':
    case 'proposal_bounced':
    case 'engagement_hot':
      // Proposal-level signals only make sense while the deal sits at
      // proposal_sent. Past that (contract out, signed, won, lost) the
      // story is no longer "give them a few days to look".
      return [STAGE_TAG_PROPOSAL_SENT];
    case 'draft_aging':
      // Draft has been sitting unfired — only relevant before a proposal
      // is out. Once the proposal is sent, draft_aging makes no sense.
      return [STAGE_TAG_INITIAL_CONTACT];
    case 'unsigned':
      // Accepted-but-not-signed lives at contract_out.
      return [STAGE_TAG_CONTRACT_OUT];
    case 'deposit_overdue':
      // Deposit overdue can fire at contract_out or deposit_received.
      return [STAGE_TAG_CONTRACT_OUT, STAGE_TAG_DEPOSIT_RECEIVED];
    default:
      return null;
  }
}

/**
 * Returns true when a follow-up queue row's `reason_type` is no longer
 * appropriate for the deal's current stage + status, i.e. the row is
 * stale and the UI should suppress it until the cron rebuilds an
 * accurate row. Used as a read-time filter; never mutates DB state.
 *
 * - Won/lost deals drop everything except `thank_you` (matches the cron's
 *   §8 sweep semantics; this is just the read-side mirror).
 * - Working deals drop rows whose required stage tags don't intersect
 *   the deal's current `stage.tags`.
 * - Reasons with no stage requirement (returns null from
 *   `requiredStageTags`) pass through as long as the deal isn't terminal.
 */
export function isReasonTypeStaleForStage(
  reasonType: string,
  dealStatus: string | null | undefined,
  stageTags: readonly string[] | null | undefined,
): boolean {
  const terminal = isTerminalStatus(dealStatus);

  // thank_you only fires post-win; surface it on won deals, drop otherwise.
  if (reasonType === 'thank_you') {
    return dealStatus !== 'won';
  }

  // All other reasons are working-pipeline only. Won/lost = stale.
  if (terminal) return true;

  const required = requiredStageTags(reasonType);
  if (required === null) return false;

  if (!stageTags || stageTags.length === 0) {
    // No tags to evaluate against — be conservative and let it through;
    // the cron will rebuild an accurate row on the next run.
    return false;
  }

  // Stale when none of the required tags appear on the current stage.
  return !required.some((tag) => stageTags.includes(tag));
}

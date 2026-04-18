/**
 * Reason-type → human copy mapping for ops.follow_up_queue.reason.
 *
 * The `reason` column is surfaced to owners on the Today widget, in the
 * Archive surface, and in the draft-generation prompts (P1). Because it's
 * displayed, it must read like a sentence — not a machine enum. This module
 * centralizes the translation so a reason_type cannot leak to the UI as a
 * raw identifier.
 *
 * Brand voice: TE/Leica/Linear precision. Sentence case. No exclamation
 * marks. Production vocabulary ("show" not "event"). See
 * docs/reference/design/copy-and-voice-guide.md.
 */

import type { FollowUpReasonType } from './triggers/schema';

type ReasonCopy = {
  /** Short one-line title for the Today widget. */
  label: string;
  /** Fuller sentence the Archive + Aion draft prompt can use. */
  description: string;
};

const REASON_COPY: Record<FollowUpReasonType, ReasonCopy> = {
  stall: {
    label: 'Stalled',
    description: 'Deal has sat in this stage longer than the stall threshold.',
  },
  engagement_hot: {
    label: 'Client is warm',
    description:
      'Client has viewed the proposal multiple times in the last 48 hours and has not replied.',
  },
  deadline_proximity: {
    label: 'Show date approaching',
    description: 'Show date is close and the deal is still open.',
  },
  no_owner: {
    label: 'No owner assigned',
    description: 'This deal has no owner — assign one before working it.',
  },
  no_activity: {
    label: 'No recent activity',
    description: 'No updates logged in several days.',
  },
  proposal_unseen: {
    label: 'Proposal not yet viewed',
    description: 'Proposal has been out for a while and the client has not opened it.',
  },
  proposal_bounced: {
    label: 'Proposal email bounced',
    description: 'The proposal email did not deliver. Confirm the client address.',
  },
  proposal_sent: {
    label: 'Proposal sent',
    description: 'Proposal is out — nudge the client to review.',
  },
  date_hold_pressure: {
    label: 'Date conflict with another deal',
    description: 'Another deal is holding this same date. Resolve before it slips.',
  },
  nudge_client: {
    label: 'Nudge the client',
    description: 'Time to reach out and move this deal forward.',
  },
  check_in: {
    label: 'Check in on the proposal',
    description: 'Proposal has been out for a week. Check in with the client.',
  },
  gone_quiet: {
    label: 'Gone quiet',
    description:
      'Proposal has been out for two weeks with no reply. Consider a stronger nudge or dropping the deal.',
  },
  thank_you: {
    label: 'Send a thank-you',
    description: 'Deal just won. Send a thank-you and set expectations for next steps.',
  },
};

/**
 * Returns the human-readable label + description for a reason_type. Unknown
 * reason types fall back to a generic "Follow up with the client" to prevent
 * a stringly-typed ID from ever reaching the UI.
 */
export function resolveReasonCopy(reasonType: string): ReasonCopy {
  return (
    REASON_COPY[reasonType as FollowUpReasonType] ?? {
      label: 'Follow up with the client',
      description: 'This deal needs attention.',
    }
  );
}

/** Convenience: just the short label. */
export function resolveReasonLabel(reasonType: string): string {
  return resolveReasonCopy(reasonType).label;
}

/** Convenience: just the fuller sentence. */
export function resolveReasonDescription(reasonType: string): string {
  return resolveReasonCopy(reasonType).description;
}

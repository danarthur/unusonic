import type { StallSignal } from './stall-signal';

export type ReasonType =
  | 'stall'
  | 'engagement_hot'
  | 'deadline_proximity'
  | 'date_hold_pressure'
  | 'no_owner'
  | 'no_activity'
  | 'proposal_bounced'
  | 'proposal_sent'
  | 'proposal_unseen'
  | 'draft_aging'
  | 'deposit_overdue'
  | 'unsigned'
  | 'dormant_client';

export type ReasonContext = {
  stall?: StallSignal | null;
  proposal?: { status?: string | null } | null;
  daysUntilEvent?: number | null;
  daysSinceActivity?: number | null;
  daysSinceDraft?: number | null;
  daysOverdue?: number | null;
  daysSinceAcceptance?: number | null;
  monthsDormant?: number | null;
};

export type RenderedReason = {
  reason: string;
  suggestedAction: string | null;
  suggestedChannel: 'call' | 'sms' | 'email' | 'manual' | null;
};

type Renderer = (ctx: ReasonContext) => RenderedReason;

const REASON_RENDERERS: Record<string, Renderer> = {
  stall: (ctx) => {
    const stall = ctx.stall;
    if (!stall) {
      return {
        reason: 'This deal may need attention.',
        suggestedAction: 'Check in with the client',
        suggestedChannel: 'email',
      };
    }
    const days = stall.daysInStage;
    if (stall.stageName === 'Inquiry') {
      return {
        reason: `This inquiry has been sitting for ${days} days without a proposal. Building one gives you a reason to re-engage.`,
        suggestedAction: 'Draft a proposal or reach out to clarify their needs',
        suggestedChannel: 'call',
      };
    }
    if (stall.stageName === 'Contract Sent' || stall.stageName === 'Contract sent') {
      return {
        reason: `Contract sent ${days} days ago with no response. A quick call to check if they have questions keeps it moving.`,
        suggestedAction: 'Call to see if they need anything before signing',
        suggestedChannel: 'call',
      };
    }
    return {
      reason: `The proposal has been out for ${days} days — a check-in referencing their event date gives you a natural reason to call.`,
      suggestedAction: 'A short, specific message works better than "just checking in"',
      suggestedChannel: 'sms',
    };
  },

  engagement_hot: () => ({
    reason: "They've viewed the proposal multiple times recently — they're actively considering. A quick call while it's on their mind.",
    suggestedAction: 'Call now or send a personal text acknowledging their interest',
    suggestedChannel: 'call',
  }),

  deadline_proximity: (ctx) => {
    const daysOut = ctx.daysUntilEvent ?? 0;
    if (daysOut <= 14) {
      return {
        reason: `The event is ${daysOut} days out with no contract signed. This is urgent — time pressure is your strongest pretext.`,
        suggestedAction: '"We need to lock this in soon to guarantee the date"',
        suggestedChannel: 'call',
      };
    }
    return {
      reason: `The event is ${daysOut} days out and no contract is signed. Referencing the timeline gives you a natural reason to follow up.`,
      suggestedAction: 'Mention the date and ask if they are ready to move forward',
      suggestedChannel: 'sms',
    };
  },

  date_hold_pressure: () => ({
    reason: 'You have another inquiry for this date. A date hold is the most effective follow-up line — "I\'m holding your date but have another inquiry."',
    suggestedAction: 'Let them know the date may not be available much longer',
    suggestedChannel: 'sms',
  }),

  no_owner: () => ({
    reason: 'Nobody is assigned to this deal. It needs an owner before it needs a follow-up.',
    suggestedAction: "Assign someone so this doesn't fall through the cracks",
    suggestedChannel: 'manual',
  }),

  no_activity: (ctx) => {
    const days = ctx.daysSinceActivity;
    if (days !== null && days !== undefined && days > 0) {
      return {
        reason: `No contact logged in ${days} days. If you've been in touch outside the system, log it so the queue stays accurate.`,
        suggestedAction: 'A quick text or call keeps the momentum going',
        suggestedChannel: 'sms',
      };
    }
    return {
      reason: 'No follow-up activity has been logged on this deal yet.',
      suggestedAction: 'Reach out to start the conversation, or log a past interaction',
      suggestedChannel: 'sms',
    };
  },

  proposal_bounced: () => ({
    reason: 'The proposal email bounced — the client may not know you sent it. Get the right address and resend.',
    suggestedAction: 'Call or text to confirm their email, then resend the proposal',
    suggestedChannel: 'call',
  }),

  proposal_sent: () => ({
    reason: 'Proposal delivered — give them a few days, then check if they have had a chance to look.',
    suggestedAction: 'Wait 2-3 days, then a short text asking if they received it',
    suggestedChannel: 'sms',
  }),

  proposal_unseen: (ctx) => {
    const days = ctx.daysSinceActivity ?? null;
    return {
      reason: days
        ? `Proposal sent ${days} days ago and never opened. Confirm it landed and didn't end up in spam.`
        : 'Proposal hasn\'t been opened yet — worth confirming it landed.',
      suggestedAction: 'A quick text: "did the proposal come through?"',
      suggestedChannel: 'sms',
    };
  },

  draft_aging: (ctx) => {
    const days = ctx.daysSinceDraft ?? 0;
    return {
      reason: `Proposal draft started ${days} days ago and never sent. The longer it sits, the colder the lead.`,
      suggestedAction: 'Finish the proposal and send it today',
      suggestedChannel: 'manual',
    };
  },

  deposit_overdue: (ctx) => {
    const days = ctx.daysOverdue ?? 0;
    return {
      reason: `Deposit ${days} days late. The booking isn't real until the deposit lands.`,
      suggestedAction: 'A quick reminder — most lateness is just oversight',
      suggestedChannel: 'sms',
    };
  },

  unsigned: (ctx) => {
    const days = ctx.daysSinceAcceptance ?? 0;
    return {
      reason: `Accepted ${days} days ago but no contract signed yet. Easy to lose between yes and signed.`,
      suggestedAction: 'Check if they need anything to get the contract back',
      suggestedChannel: 'call',
    };
  },

  dormant_client: (ctx) => {
    const months = ctx.monthsDormant ?? 0;
    return {
      reason: `Haven't spoken in ${months} months. Worth a check-in before they book elsewhere.`,
      suggestedAction: 'A short personal note — no agenda, just keeping the relationship warm',
      suggestedChannel: 'sms',
    };
  },
};

const FALLBACK: RenderedReason = {
  reason: 'This deal could use some attention.',
  suggestedAction: null,
  suggestedChannel: null,
};

export function renderReason(reasonType: string, ctx: ReasonContext = {}): RenderedReason {
  const renderer = REASON_RENDERERS[reasonType];
  return renderer ? renderer(ctx) : FALLBACK;
}

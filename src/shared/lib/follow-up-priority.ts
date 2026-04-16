import { differenceInDays, parseISO } from 'date-fns';
import { computeStallSignalFromRaw, type StallSignal } from './stall-signal';

const STATUS_TO_STAGE: Record<string, number> = {
  inquiry: 0,
  proposal: 1,
  contract_sent: 2,
};

export type FollowUpScoreInput = {
  deal: {
    status: string;
    createdAt: string;
    proposedDate: string | null;
    budgetEstimated: number | null;
    ownerUserId: string | null;
  };
  proposal: {
    createdAt: string | null;
    updatedAt: string | null;
    status: string | null;
    viewCount: number;
    lastViewedAt: string | null;
    emailBouncedAt: string | null;
  } | null;
  daysSinceActivity: number | null;
  hasContestedDate: boolean;
  thresholdOverrides?: { inquiry?: number; proposal?: number; contract_sent?: number };
  now?: Date;
};

export type FollowUpScoreOutput = {
  score: number;
  reasonType: string;
  reasonContext: {
    stall: StallSignal | null;
    proposal: { status: string | null } | null;
    daysUntilEvent: number | null;
    daysSinceActivity: number | null;
  };
};

type Signal = { type: string; weight: number };

function lift(current: Signal, candidate: Signal): Signal {
  return candidate.weight > current.weight ? candidate : current;
}

function isWithinHours(dateStr: string, hours: number, now: number): boolean {
  const diffMs = now - new Date(dateStr).getTime();
  return diffMs >= 0 && diffMs <= hours * 3600000;
}

function scoreStall(stall: StallSignal | null): Signal | null {
  if (!stall) return null;
  if (stall.urgent) return { type: 'stall', weight: 15 };
  if (stall.stalled) return { type: 'stall', weight: 8 };
  return null;
}

function scoreProximity(proposedDate: string | null, now: Date): { daysUntilEvent: number | null; signal: Signal | null; add: number } {
  if (!proposedDate) return { daysUntilEvent: null, signal: null, add: 0 };
  const daysUntilEvent = Math.max(0, differenceInDays(parseISO(proposedDate), now));
  const w = Math.max(0, 30 - daysUntilEvent) * 1.5;
  return { daysUntilEvent, signal: w > 0 ? { type: 'deadline_proximity', weight: w } : null, add: w };
}

function scoreEngagement(
  proposal: FollowUpScoreInput['proposal'],
  nowMs: number,
): { add: number; signal: Signal | null } {
  if (!proposal) return { add: 0, signal: null };
  const vc = proposal.viewCount ?? 0;
  if (vc >= 2 && proposal.lastViewedAt && isWithinHours(proposal.lastViewedAt, 48, nowMs)) {
    return { add: 25, signal: { type: 'engagement_hot', weight: 25 } };
  }
  const viewAdd = vc > 0 ? 5 : 0;
  const bounceAdd = proposal.emailBouncedAt ? 12 : 0;
  const bSig = proposal.emailBouncedAt ? { type: 'proposal_bounced', weight: 12 } : null;
  return { add: viewAdd + bounceAdd, signal: bSig };
}

function scoreActivity(daysSince: number | null): { add: number; signal: Signal | null } {
  if (daysSince !== null && daysSince > 14) return { add: 6, signal: { type: 'no_activity', weight: 6 } };
  if (daysSince !== null && daysSince > 7) return { add: 3, signal: null };
  if (daysSince === null) return { add: 4, signal: { type: 'no_activity', weight: 4 } };
  return { add: 0, signal: null };
}

function scoreOwnership(ownerUserId: string | null): Signal | null {
  return ownerUserId ? null : { type: 'no_owner', weight: 8 };
}

function scoreDateHold(hasContestedDate: boolean, dealStatus: string): Signal | null {
  if (!hasContestedDate) return null;
  if (dealStatus === 'contract_sent') return null;
  return { type: 'date_hold_pressure', weight: 10 };
}

function apply(acc: { score: number; top: Signal }, add: number, sig: Signal | null) {
  acc.score += add;
  if (sig) acc.top = lift(acc.top, sig);
}

function buildStallInput(input: FollowUpScoreInput): Parameters<typeof computeStallSignalFromRaw>[0] {
  const { deal, proposal, thresholdOverrides } = input;
  return {
    status: deal.status,
    createdAt: deal.createdAt,
    proposalCreatedAt: proposal?.createdAt ?? null,
    proposalUpdatedAt: proposal?.updatedAt ?? null,
    proposedDate: deal.proposedDate,
    currentStage: STATUS_TO_STAGE[deal.status] ?? 0,
    thresholdOverrides,
  };
}

function applyOptional(acc: { score: number; top: Signal }, sig: Signal | null) {
  if (!sig) return;
  acc.score += sig.weight;
  acc.top = lift(acc.top, sig);
}

export function computeFollowUpPriority(input: FollowUpScoreInput): FollowUpScoreOutput | null {
  const { deal, proposal, daysSinceActivity, hasContestedDate } = input;
  const now = input.now ?? new Date();
  const acc = { score: 0, top: { type: 'no_activity', weight: 0 } as Signal };

  const stall = computeStallSignalFromRaw(buildStallInput(input));
  applyOptional(acc, scoreStall(stall));

  const prox = scoreProximity(deal.proposedDate, now);
  apply(acc, prox.add, prox.signal);

  acc.score += deal.budgetEstimated ? Math.min(5, deal.budgetEstimated / 10000) : 0;

  const eng = scoreEngagement(proposal, now.getTime());
  apply(acc, eng.add, eng.signal);

  applyOptional(acc, scoreOwnership(deal.ownerUserId));

  const act = scoreActivity(daysSinceActivity);
  apply(acc, act.add, act.signal);

  applyOptional(acc, scoreDateHold(hasContestedDate, deal.status));

  if (acc.score <= 0) return null;

  return {
    score: acc.score,
    reasonType: acc.top.type,
    reasonContext: {
      stall,
      proposal: proposal ? { status: proposal.status } : null,
      daysUntilEvent: prox.daysUntilEvent,
      daysSinceActivity,
    },
  };
}

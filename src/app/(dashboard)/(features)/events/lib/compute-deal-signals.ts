/**
 * Pure computation: derives the per-deal "signal stack" from deal + proposal
 * + client-history inputs. No DB calls, no side effects — safe to call on
 * server or client. The single source of truth for deal-level signals
 * shared between the Signals card and Aion's `get_deal_signals` tool.
 *
 * Design philosophy (Path A, 2026-04-28):
 *   - The previous "Win probability" stat read a column that didn't exist.
 *     Rather than build an ungrounded probability model, we surface the
 *     observable facts a production owner would weigh by gut.
 *   - Each signal is a concrete fact with explicit polarity and severity.
 *     No aggregated number, no bucket — the human's gut does the synthesis.
 *   - Aion narrates the same signals in prose ("they've gone quiet — 9
 *     days since last reply, deposit unpaid 12 days post-accept").
 *
 * Reference: docs/audits/win-probability-research-2026-04-28.md
 */

export type DealSignalKey =
  | 'deposit_paid'
  | 'proposal_hot'
  | 'proposal_unviewed_long'
  | 'proposal_cooling'
  | 'date_passed'
  | 'repeat_client'
  | 'unassigned';

export type DealSignalPolarity = 'positive' | 'negative' | 'neutral';
export type DealSignalSeverity = 'high' | 'medium' | 'low';

export type DealSignal = {
  key: DealSignalKey;
  /** Short noun phrase. Renders as the row label on the Signals card. */
  label: string;
  /** Concrete fact in the row body. Always specific — no hedge words. */
  value: string;
  polarity: DealSignalPolarity;
  severity: DealSignalSeverity;
  /**
   * Aion-friendly natural-language sentence the model can quote verbatim.
   * Keeps the card and the chat surface in lockstep — same fact, two voices.
   */
  sentence: string;
};

export type DealSignalInputs = {
  deal: {
    id: string;
    status: string | null;
    proposed_date: string | null;
    /** Legacy owner field — kept on existing rows alongside owner_entity_id. */
    owner_user_id: string | null;
    /** Newer owner field — preferred. Either being set means the deal is assigned. */
    owner_entity_id: string | null;
    organization_id: string | null;
  };
  /**
   * Most recent non-draft proposal for this deal, or null if none has been
   * sent. We only look at the latest because proposal_hot / cooling /
   * unviewed apply to the active sales cycle, not historical ones.
   */
  proposal: {
    status: string | null;
    view_count: number | null;
    first_viewed_at: string | null;
    last_viewed_at: string | null;
    created_at: string | null;
    signed_at: string | null;
    accepted_at: string | null;
    deposit_paid_at: string | null;
  } | null;
  /** Count of prior WON deals with the same organization (excludes current). */
  priorWonCount: number;
  /** Reference timestamp — Date.now() in production, parameterized for tests. */
  now: number;
};

const SEVERITY_RANK: Record<DealSignalSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Casual relative-time formatter for signal values: "3h ago", "2d ago",
 * "just now". Production owners read these at a glance — no timezone math,
 * no month names. Past tense only.
 */
function relativeShort(now: number, isoOrTimestamp: string): string {
  const then = new Date(isoOrTimestamp).getTime();
  const deltaMs = Math.max(0, now - then);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(deltaMs / HOUR_MS);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(deltaMs / DAY_MS);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function computeDealSignals(inputs: DealSignalInputs): DealSignal[] {
  const { deal, proposal, priorWonCount, now } = inputs;
  const signals: DealSignal[] = [];

  const isTerminal = deal.status === 'won' || deal.status === 'lost';

  // ── Deposit paid ──
  // Strongest positive confirmation; runs even on terminal deals so historical
  // wins still show the receipt.
  if (proposal?.deposit_paid_at) {
    signals.push({
      key: 'deposit_paid',
      label: 'Deposit paid',
      value: relativeShort(now, proposal.deposit_paid_at),
      polarity: 'positive',
      severity: 'low',
      sentence: `Deposit cleared ${relativeShort(now, proposal.deposit_paid_at)}.`,
    });
  }

  // ── Hot lead ──
  // Multi-view in the last 48h on an active proposal. This is the strongest
  // buy signal we can compute without inbound replies (Replies Phase 1.5).
  if (
    !isTerminal &&
    proposal?.last_viewed_at &&
    (proposal.view_count ?? 0) >= 2 &&
    !proposal.signed_at &&
    !proposal.accepted_at
  ) {
    const hoursSinceView = (now - new Date(proposal.last_viewed_at).getTime()) / HOUR_MS;
    if (hoursSinceView <= 48) {
      const viewCount = proposal.view_count!;
      signals.push({
        key: 'proposal_hot',
        label: 'Hot lead',
        value: `${viewCount}× views, last ${relativeShort(now, proposal.last_viewed_at)}`,
        polarity: 'positive',
        severity: 'high',
        sentence: `Client opened the proposal ${viewCount} times in the last 48 hours — last view ${relativeShort(now, proposal.last_viewed_at)}.`,
      });
    }
  }

  // ── Proposal cooling ──
  // Sent + viewed at least once but no activity for 7+ days. Distinct from
  // proposal_unviewed_long — they DID look, then went quiet.
  if (
    !isTerminal &&
    proposal?.status === 'sent' &&
    proposal.last_viewed_at &&
    !proposal.signed_at &&
    !proposal.accepted_at
  ) {
    const daysSinceView = (now - new Date(proposal.last_viewed_at).getTime()) / DAY_MS;
    if (daysSinceView >= 7) {
      signals.push({
        key: 'proposal_cooling',
        label: 'Proposal cooling',
        value: `${Math.floor(daysSinceView)}d since last view`,
        polarity: 'negative',
        severity: 'medium',
        sentence: `Proposal hasn't been opened in ${Math.floor(daysSinceView)} days — they were looking, now they've stopped.`,
      });
    }
  }

  // ── Proposal unviewed ──
  // Sent 7+ days ago, never opened. Bounce risk or wrong recipient.
  if (
    !isTerminal &&
    proposal?.status === 'sent' &&
    (proposal.view_count ?? 0) === 0 &&
    proposal.created_at
  ) {
    const daysSinceSent = (now - new Date(proposal.created_at).getTime()) / DAY_MS;
    if (daysSinceSent >= 7) {
      signals.push({
        key: 'proposal_unviewed_long',
        label: 'Proposal unopened',
        value: `Sent ${Math.floor(daysSinceSent)}d ago, never viewed`,
        polarity: 'negative',
        severity: 'medium',
        sentence: `Proposal was sent ${Math.floor(daysSinceSent)} days ago and the client hasn't opened it once. Worth checking the email landed.`,
      });
    }
  }

  // ── Date passed ──
  // Event date is in the past but the deal is still in a working state. A
  // production-specific alarm — typically means the deal was abandoned or
  // the date moved without updating the record.
  if (!isTerminal && deal.proposed_date) {
    const eventDate = new Date(deal.proposed_date + 'T00:00:00').getTime();
    const daysPast = (now - eventDate) / DAY_MS;
    if (daysPast > 0) {
      const days = Math.floor(daysPast);
      signals.push({
        key: 'date_passed',
        label: 'Event date passed',
        value: `${days}d past, deal still open`,
        polarity: 'negative',
        severity: 'high',
        sentence: `The proposed event date was ${days} days ago and this deal is still marked open. Either close it out or update the date.`,
      });
    }
  }

  // ── Repeat client ──
  // Prior won deals with the same organization. Strong positive signal —
  // returning clients close at much higher rates than cold inquiries.
  if (deal.organization_id && priorWonCount > 0) {
    signals.push({
      key: 'repeat_client',
      label: 'Repeat client',
      value: `${priorWonCount} prior show${priorWonCount === 1 ? '' : 's'}`,
      polarity: 'positive',
      severity: 'low',
      sentence: `Returning client — they've booked ${priorWonCount} prior show${priorWonCount === 1 ? '' : 's'} with you.`,
    });
  }

  // ── Unassigned ──
  // No owner = no one accountable for follow-up. The single biggest cause
  // of deals dying quietly per the follow-up engine analytics. Either owner
  // field counts — owner_entity_id is the newer canonical column, but
  // owner_user_id is still set on legacy rows.
  if (!isTerminal && !deal.owner_user_id && !deal.owner_entity_id) {
    signals.push({
      key: 'unassigned',
      label: 'No owner',
      value: 'Deal is unassigned',
      polarity: 'negative',
      severity: 'medium',
      sentence: `This deal has no owner assigned — there's no one accountable for the follow-up.`,
    });
  }

  return signals.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

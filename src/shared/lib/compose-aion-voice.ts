/**
 * Aion voice composer — pure function for assembling the deal-card voice
 * paragraph from signal inputs.
 *
 * Binding rules (User Advocate, design doc §20.8):
 *   - Deal fact first, owner pattern as measuring stick.
 *   - Possessive framing ("your X-day rhythm"), never "you usually…".
 *   - Every observation ends in an implied decision (renders elsewhere;
 *     this composer just produces the sentence).
 *   - No timestamp-specificity ("Tuesday at 9am"), no deal value, no
 *     win-rate stats, no "Aion is still learning" disclosures.
 *   - Sentence case. No exclamation marks. "Show" not "event".
 *
 * Card variants (§7.1):
 *   - `both`            — Outbound + Pipeline both have rows
 *   - `outbound_only`   — stall/nudge only, no stage-advance insight
 *   - `pipeline_only`   — advance-only row; collapsed line, no voice paragraph
 *   - `collapsed`       — no rows; card hides (returns empty voice)
 *
 * Output is the **voice paragraph** only. Header ("Aion" wordmark), section
 * labels, row CTAs, and metadata ("to Emily · last touch 9d ago") are
 * rendered by the card component, not here.
 */

import type { DealUrgency } from './deal-urgency';
import { shouldSurfaceDaysOutInVoice } from './deal-urgency';
import type { OwnerCadenceProfile } from './owner-cadence';
import type { CadenceArchetype } from './cadence-defaults';
import { defaultDaysToFirstFollowup } from './cadence-defaults';

export type CardVariant = 'both' | 'outbound_only' | 'pipeline_only' | 'collapsed';

export type StallSnapshot = {
  /** Days since the deal entered the current stage (pipeline dwell). */
  daysInStage: number | null;
  /** Stage label for the voice paragraph, already humanized ("Inquiry"). */
  stageLabel: string | null;
  /** The rotting_days threshold from pipeline_stages, if configured. */
  stageRottingDays: number | null;
};

export type ProposalEngagement = {
  /** When the proposal was sent (email_delivered_at or created_at fallback). */
  sentAt: string | null;
  /** Cumulative open count on the public link. */
  viewCount: number;
  /** Last open timestamp. */
  lastViewedAt: string | null;
  /** Whether a recent hot-viewing burst happened (≥2 opens in 48h). */
  recentHotOpens: boolean;
  /** Set if Resend reported a bounce on the delivery. Blocker voice (Navigator A11). */
  bouncedAt: string | null;
  /** Set once deposit lands. Used upstream to filter stale hot-lead insights (Navigator A13). */
  depositPaidAt: string | null;
};

export type ClientAddress = {
  /** First name of the deal's main contact, or null to use neutral language. */
  firstName: string | null;
};

export type ComposeInput = {
  variant: CardVariant;
  urgency: DealUrgency;
  stall: StallSnapshot | null;
  proposal: ProposalEngagement | null;
  client: ClientAddress;
  cadence: OwnerCadenceProfile | null;  // null when opt-in is off
  /** Tier 2 Phase 7b — owner-entered "why" anchor. When present, surfaces
   *  as a brief lead ("Daughter's wedding. …") that situates the deal. */
  compellingEvent?: string | null;
};

export type ComposedVoice = {
  /** The voice paragraph string. Empty string when the card hides. */
  voice: string;
  /** Flags explaining which signals contributed (useful for tooltip + tests). */
  contributingSignals: Array<
    | 'days_out'
    | 'proposal_sent'
    | 'hot_opens'
    | 'stall_vs_rotting'
    | 'cadence_exceeded'
    | 'cadence_tooltip'
    | 'proposal_bounced'
    | 'compelling_event'
  >;
};

/**
 * Compose the voice paragraph. Returns empty voice for `collapsed` and
 * `pipeline_only` variants — the card uses a single-line affordance
 * instead.
 */
export function composeAionVoice(input: ComposeInput): ComposedVoice {
  if (input.variant === 'collapsed' || input.variant === 'pipeline_only') {
    return { voice: '', contributingSignals: [] };
  }

  const parts: string[] = [];
  const signals: ComposedVoice['contributingSignals'] = [];

  // 0. Bounced-proposal blocker (Tier 1, Navigator A11). Overrides everything
  //    else — a data-quality issue isn't a nudge story, it's a block on the
  //    whole follow-up loop. "No reply from Emily" makes no sense if the
  //    email never arrived.
  if (input.proposal?.bouncedAt) {
    const who = input.client.firstName ?? 'your client';
    parts.push(`Proposal to ${who} bounced. The email address may be wrong.`);
    signals.push('proposal_bounced');
    return { voice: parts.join(' '), contributingSignals: signals };
  }

  // 1. Hot-opens lead — overrides the stall story entirely when present.
  //    User Advocate ranked proposal engagement #3 overall; when client is
  //    hot, the narrative shifts from "you're late" to "they're moving."
  //    Skip when deposit landed — that's Phase 7a Tier 1 cleanup (Navigator
  //    A13 is enforced upstream by filtering hot_lead insights, but the voice
  //    would still fire here based on view_count. Belt-and-suspenders.)
  if (
    input.proposal?.recentHotOpens
    && input.proposal.viewCount >= 2
    && !input.proposal.depositPaidAt
  ) {
    const who = input.client.firstName ?? 'the client';
    parts.push(`${who} opened the proposal ${input.proposal.viewCount}× in the last 48 hours.`);
    signals.push('hot_opens');
    // Hot-opens subsumes most other signals; keep it short and return.
    if (shouldSurfaceDaysOutInVoice(input.urgency)) {
      parts.unshift(`${input.urgency.daysOut} days out.`);
      signals.push('days_out');
    }
    return { voice: parts.join(' '), contributingSignals: signals };
  }

  // 2. Days-out lead — surface only when near-term (≤30d).
  if (shouldSurfaceDaysOutInVoice(input.urgency)) {
    parts.push(`${input.urgency.daysOut} days out.`);
    signals.push('days_out');
  }

  // 3. Proposal-sent recency (when no hot-opens story).
  if (input.proposal?.sentAt) {
    const daysAgo = daysBetween(new Date(input.proposal.sentAt), new Date());
    if (daysAgo !== null && daysAgo >= 1) {
      parts.push(`Proposal sent ${daysAgo} ${daysAgo === 1 ? 'day' : 'days'} ago.`);
      signals.push('proposal_sent');
    }
  }

  // 4. Cadence comparison — "past your typical window." Only if Scope-3
  //    gate passed AND proposal is older than the owner's typical cadence.
  //    Falls back silently to archetype defaults below threshold.
  const cadenceClause = buildCadenceClause(input);
  if (cadenceClause) {
    parts.push(cadenceClause.clause);
    signals.push(cadenceClause.signal);
  } else if (input.stall && isStaleAgainstRotting(input.stall)) {
    // 5. Stall fallback — only when cadence didn't speak AND the workspace
    //    rotting threshold is exceeded. Uses stage dwell, not owner pattern.
    parts.push(stallClause(input.stall));
    signals.push('stall_vs_rotting');
  }

  // 6. "Gone quiet" floor — if we've said nothing yet AND we have a contact
  //    name, at least acknowledge the silence. Never invent urgency.
  if (parts.length === 0 && input.client.firstName) {
    parts.push(`No reply from ${input.client.firstName}.`);
  }

  // 7. Compelling-event anchor (Tier 2 Phase 7b). When the owner captured
  //    "the why" and we have any voice to pair it with, prepend the anchor
  //    as a short lead: "Daughter's wedding. Proposal sent 9 days ago."
  //    Preserves capitalization/punctuation the owner typed — this is their
  //    data, surfaced as-is. Skip when voice is otherwise empty (the anchor
  //    alone is filler, not a nudge).
  const anchor = normalizeCompellingEvent(input.compellingEvent);
  if (anchor && parts.length > 0) {
    parts.unshift(anchor);
    signals.push('compelling_event');
  }

  return { voice: parts.join(' ').trim(), contributingSignals: signals };
}

/** Normalize user-entered compelling_event for voice — trim, ensure final
 *  period, cap at 80 chars (reasonable sentence). Owner punctuation kept
 *  otherwise. */
function normalizeCompellingEvent(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const truncated = trimmed.length > 80 ? trimmed.slice(0, 77) + '…' : trimmed;
  if (/[.!?…]$/.test(truncated)) return truncated;
  return truncated + '.';
}

function buildCadenceClause(input: ComposeInput):
  | { clause: string; signal: 'cadence_exceeded' | 'cadence_tooltip' }
  | null {
  if (!input.proposal?.sentAt) return null;
  const daysSinceProposal = daysBetween(new Date(input.proposal.sentAt), new Date());
  if (daysSinceProposal === null || daysSinceProposal < 1) return null;

  // Scope 3: personalization path — "past your typical check-in window."
  if (input.cadence?.sampleQuality === 'sufficient') {
    const typical = input.cadence.typicalDaysProposalToFirstFollowup;
    if (typical !== null && typical > 0 && daysSinceProposal > typical) {
      return {
        clause: 'Past your typical check-in window.',
        signal: 'cadence_exceeded',
      };
    }
  }
  // No voice-paragraph personalization when gate is insufficient or threshold
  // not yet crossed. Archetype default still affects priority and tooltip.
  return null;
}

function stallClause(stall: StallSnapshot): string {
  if (stall.daysInStage === null) return '';
  const stage = stall.stageLabel ?? 'this stage';
  return `${stall.daysInStage} days in ${stage}.`;
}

function isStaleAgainstRotting(stall: StallSnapshot): boolean {
  if (stall.daysInStage === null || stall.stageRottingDays === null) return false;
  return stall.daysInStage >= stall.stageRottingDays;
}

function daysBetween(earlier: Date, later: Date): number | null {
  const ms = later.getTime() - earlier.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 86_400_000);
}

/**
 * Public helper for the "Why this?" tooltip content. Unlike composeAionVoice
 * above, this CAN include cadence data when `sampleQuality='sufficient'` OR
 * when falling back to archetype defaults — the tooltip is less guarded than
 * the voice paragraph because it's opt-in content.
 */
export function composeCadenceTooltipLine(
  cadence: OwnerCadenceProfile | null,
  rawArchetype: string | null | undefined,
): string | null {
  if (cadence?.sampleQuality === 'sufficient'
      && cadence.typicalDaysProposalToFirstFollowup !== null) {
    const d = Math.round(cadence.typicalDaysProposalToFirstFollowup);
    return `Your typical check-in: ${d} ${d === 1 ? 'day' : 'days'} after sending a proposal.`;
  }
  // Fall back to archetype default, but framed as "industry typical" not
  // "your" so we don't make a false personal claim.
  const defaultDays = defaultDaysToFirstFollowup(rawArchetype);
  return `Typical check-in for ${describeArchetype(rawArchetype)}: ${defaultDays} days after sending a proposal.`;
}

function describeArchetype(raw: string | null | undefined): string {
  const a: CadenceArchetype = raw && ['wedding', 'corporate', 'tour'].includes(raw.toLowerCase())
    ? (raw.toLowerCase() as CadenceArchetype)
    : 'other';
  if (a === 'wedding') return 'weddings';
  if (a === 'corporate') return 'corporate shows';
  if (a === 'tour') return 'tours';
  return 'shows like this';
}

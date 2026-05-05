/**
 * Pure computation: derives the per-event "signal stack" surfaced by the
 * Plan-tab Aion card. Mirrors the shape of compute-deal-signals.ts but
 * lives in the production phase (post-handoff, pre-show).
 *
 * Design philosophy (Plan Aion v1, 2026-04-28):
 *   - The Plan tab already shows current-state widgets (Show Health pill,
 *     Readiness Ribbon, Advancing Checklist). Those answer "is this on
 *     track?", "what's red?", "what's left?" — the Aion card answers a
 *     different question: "What needs my attention?"
 *   - The Aion card surfaces what the other widgets CAN'T see — drift,
 *     silence, and conflict across shows. Anything that overlaps 1:1 with
 *     an Advancing Checklist item is intentionally skipped (Field Expert
 *     2026-04-28: "the checklist owns the action layer").
 *   - Time-gated escalation: T-30 quiet sentry, T-7 triage nurse, T-0 HUD.
 *     Same signals, different vigilance thresholds.
 *
 * Reference: docs/reference/aion-plan-card-design.md
 */

export type EventSignalKey =
  | 'show_health_alert'
  | 'cross_show_conflict'
  | 'deposit_overdue'
  | 'final_invoice_unsent'
  | 'ros_stale'
  | 'stakeholder_silent';

export type EventSignalPolarity = 'positive' | 'negative' | 'neutral';
export type EventSignalSeverity = 'high' | 'medium' | 'low';

export type EventSignal = {
  key: EventSignalKey;
  /** Short noun phrase ("Conflict", "Run of show stale"). */
  label: string;
  /** Concrete fact in name + verb + number form. */
  value: string;
  polarity: EventSignalPolarity;
  severity: EventSignalSeverity;
  /**
   * Aion-friendly natural-language sentence the model can quote verbatim.
   * Keeps the card and the chat surface in lockstep — same fact, two voices.
   */
  sentence: string;
};

export type EventSignalConflict = {
  kind: 'crew' | 'gear';
  /** Resource name (crew member, gear item). */
  resourceName: string;
  /** Title of the OTHER show this resource is also booked for. */
  otherEventTitle: string;
};

export type EventSignalInputs = {
  event: {
    id: string;
    /** ISO timestamp of when the show begins. */
    startsAt: string;
  };
  deal: {
    id: string;
    showHealth: {
      status: 'on_track' | 'at_risk' | 'blocked';
      note: string;
    } | null;
  } | null;
  /** Most recent non-draft proposal for this deal (deposit timing). */
  proposal: {
    acceptedAt: string | null;
    depositPaidAt: string | null;
  } | null;
  /**
   * Cross-show conflicts already detected by `getEventConflicts`. Pass
   * the raw list — `computeEventSignals` collapses it into one signal.
   */
  conflicts: EventSignalConflict[];
  /**
   * ISO timestamp of the latest entry in `ops.follow_up_log` for this
   * deal/event, or null if none exists. Drives the "stakeholder silent"
   * proxy until Replies Phase 1 ships and we can read inbound message
   * cadence directly.
   */
  lastFollowUpAt: string | null;
  /**
   * ISO timestamp of the latest run-of-show edit (cue update, header
   * change, or run_of_show_data write). Powers the staleness signal.
   */
  rosLastModifiedAt: string | null;
  /** Final invoice for this deal/event, if one has been spawned. */
  finalInvoice: {
    status: string | null;
  } | null;
  /** Reference timestamp — Date.now() in production, parameterized for tests. */
  now: number;
};

const SEVERITY_RANK: Record<EventSignalSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Returns the silence threshold (days without follow-up) at which we fire
 * `stakeholder_silent`, weighted by how close we are to show day. The
 * closer the show, the less tolerance for silence — User Advocate 2026-04-28
 * ("at T-7, anything unanswered reads red").
 */
function silenceThresholdDays(daysToShow: number): number {
  if (daysToShow <= 3) return 2;
  if (daysToShow <= 7) return 3;
  if (daysToShow <= 14) return 5;
  if (daysToShow <= 30) return 7;
  return 14;
}

export function computeEventSignals(inputs: EventSignalInputs): EventSignal[] {
  const { event, deal, proposal, conflicts, lastFollowUpAt, rosLastModifiedAt, finalInvoice, now } = inputs;
  const signals: EventSignal[] = [];

  const eventStart = new Date(event.startsAt).getTime();
  const daysToShow = Math.floor((eventStart - now) / DAY_MS);
  // After the show is over the Aion card's job changes (wrap-up world).
  // Don't fire planning signals for past events.
  const isPast = daysToShow < 0;

  // ── Show-health alert ──
  // The owner's manual "this show is at risk / blocked" assertion is the
  // single most important thing to amplify. We don't second-guess it; we
  // surface the note prominently. Always-on regardless of T-anchor.
  if (deal?.showHealth && deal.showHealth.status !== 'on_track') {
    const status = deal.showHealth.status;
    const note = deal.showHealth.note?.trim();
    const labelText = status === 'blocked' ? 'Show blocked' : 'Show at risk';
    signals.push({
      key: 'show_health_alert',
      label: labelText,
      value: note ? truncate(note, 80) : 'No note set',
      polarity: 'negative',
      severity: status === 'blocked' ? 'high' : 'high',
      sentence: note
        ? `You flagged this show as ${status === 'blocked' ? 'blocked' : 'at risk'}: "${note}"`
        : `You flagged this show as ${status === 'blocked' ? 'blocked' : 'at risk'}, but didn't add a note. Worth jotting one down before it slips.`,
    });
  }

  // ── Cross-show conflict ──
  // Crew or gear booked on this show AND another show on or near the same
  // date. This is uniquely Aion territory — no other widget sees across
  // shows. Surfaces at any T-anchor; the closer to show day, the worse.
  if (!isPast && conflicts.length > 0) {
    const firstNames = conflicts.slice(0, 2).map((c) => c.resourceName).join(' and ');
    const remaining = conflicts.length - 2;
    const valueText = remaining > 0
      ? `${firstNames} +${remaining} more double-booked`
      : `${firstNames} double-booked`;
    const sentenceParts = conflicts.map(
      (c) => `${c.resourceName} (${c.kind}) is also booked on ${c.otherEventTitle}`,
    );
    signals.push({
      key: 'cross_show_conflict',
      label: 'Cross-show conflict',
      value: valueText,
      polarity: 'negative',
      severity: daysToShow <= 7 ? 'high' : 'medium',
      sentence: sentenceParts.length === 1
        ? `${sentenceParts[0]}. One of them has to flex.`
        : `${sentenceParts.length} double-bookings: ${sentenceParts.join('; ')}.`,
    });
  }

  // ── Deposit overdue ──
  // Deposit not paid past acceptance + a grace window. The deal-signals
  // version on the Sales tab catches this earlier; on Plan it's a worse
  // problem because the show is now scheduled.
  if (!isPast && proposal?.acceptedAt && !proposal.depositPaidAt) {
    const daysSinceAccept = Math.floor((now - new Date(proposal.acceptedAt).getTime()) / DAY_MS);
    if (daysSinceAccept >= 7) {
      signals.push({
        key: 'deposit_overdue',
        label: 'Deposit unpaid',
        value: `${daysSinceAccept}d since accept`,
        polarity: 'negative',
        severity: daysToShow <= 14 ? 'high' : 'medium',
        sentence: `Deposit hasn't cleared ${daysSinceAccept} days after acceptance. ${daysToShow <= 14 ? 'Show is in ' + daysToShow + ' days — escalate today.' : 'Worth a check-in.'}`,
      });
    }
  }

  // ── Final invoice not sent ──
  // At T-7, the final invoice should be in flight. If the row doesn't exist
  // OR is still draft, that's a money signal worth surfacing.
  if (!isPast && daysToShow <= 14 && (!finalInvoice || finalInvoice.status === 'draft' || finalInvoice.status === null)) {
    signals.push({
      key: 'final_invoice_unsent',
      label: 'Final invoice unsent',
      value: daysToShow <= 7 ? `T-${Math.max(0, daysToShow)}` : `${daysToShow}d out`,
      polarity: 'negative',
      severity: daysToShow <= 7 ? 'high' : 'medium',
      sentence: daysToShow <= 7
        ? `Final invoice still hasn't been sent — show is ${daysToShow} day${daysToShow === 1 ? '' : 's'} out. Send it today.`
        : `Final invoice hasn't been sent yet. Plenty of time, but worth getting it in motion this week.`,
    });
  }

  // ── Run-of-show staleness ──
  // Linear's pattern: if the run of show hasn't been touched in N days and
  // the show is in M days where M < N, that's drift. Different from "is RoS
  // empty?" (which is checklist territory). This says "you started building
  // it and stopped."
  if (!isPast && rosLastModifiedAt && daysToShow >= 0) {
    const daysSinceTouch = Math.floor((now - new Date(rosLastModifiedAt).getTime()) / DAY_MS);
    // Only fire when daysSinceTouch is BOTH > daysToShow and >= 7. If the
    // show is 30 days out and the RoS hasn't been touched in 14, that's not
    // a problem yet. If it's 5 days out and RoS hasn't been touched in 8,
    // that's a drift signal.
    if (daysSinceTouch >= 7 && daysSinceTouch > daysToShow) {
      signals.push({
        key: 'ros_stale',
        label: 'Run of show stale',
        value: `${daysSinceTouch}d untouched, ${daysToShow}d to show`,
        polarity: 'negative',
        severity: daysToShow <= 7 ? 'high' : 'medium',
        sentence: `Run of show hasn't been edited in ${daysSinceTouch} days; show is in ${daysToShow}. If you're done with it, ignore — but worth a once-over.`,
      });
    }
  }

  // ── Stakeholder silent ──
  // Proxy for "the client / planner / venue contact has gone quiet." Until
  // Replies ships we use ops.follow_up_log.created_at as the latest-touch
  // timestamp; weak signal but better than nothing. Threshold scales with
  // proximity to show day — at T-30 a week of quiet is fine, at T-7 it's
  // an alarm.
  if (!isPast) {
    const threshold = silenceThresholdDays(daysToShow);
    if (lastFollowUpAt) {
      const daysQuiet = Math.floor((now - new Date(lastFollowUpAt).getTime()) / DAY_MS);
      if (daysQuiet >= threshold) {
        signals.push({
          key: 'stakeholder_silent',
          label: 'Gone quiet',
          value: `${daysQuiet}d since last touch`,
          polarity: 'negative',
          severity: daysToShow <= 7 ? 'high' : 'medium',
          sentence: `${daysQuiet} days since the last logged follow-up on this show. ${daysToShow <= 7 ? 'Show is ' + daysToShow + ' days out — make a call today.' : 'Worth a check-in to make sure nothing\u2019s drifting on the client side.'}`,
        });
      }
    }
  }

  return signals.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

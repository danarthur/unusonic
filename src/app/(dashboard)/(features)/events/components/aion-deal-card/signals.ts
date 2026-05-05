/**
 * Signal-list composition for the AionDealCard.
 *
 * Pure utilities — no React, no I/O. Builds a SignalEntry[] from card data
 * by layering primary-recommendation evidence, stall context, cadence
 * profile, event-approach urgency, and dedupe'd voice signals. Capped at
 * 5 entries so the card stays scannable.
 *
 * Extracted from aion-deal-card.tsx (Phase 0.5-style split, 2026-04-28).
 */

import type { AionCardData } from '../../actions/get-aion-card-for-deal';
import type { SignalEntry } from '../aion-card-primitives';
import type { PrimaryRecommendation } from './types';
import { daysSince } from '@/shared/lib/days-since';

// Re-export so existing callers of `aion-deal-card/signals` keep working;
// the implementation now lives in @/shared/lib/days-since (audit, 2026-04-29).
export { daysSince };

export function composeSignals({
  data,
  primary,
}: {
  data: AionCardData;
  primary: PrimaryRecommendation;
}): SignalEntry[] {
  const out: SignalEntry[] = [];

  // Primary recommendation's own evidence first.
  if (primary.kind === 'outbound') {
    if (primary.row.reasonLabel) {
      out.push({ label: 'Status', value: primary.row.reasonLabel, kind: 'context' });
    }
    if (primary.row.lastTouchAt) {
      const days = daysSince(primary.row.lastTouchAt);
      if (days != null) {
        out.push({
          label: 'No reply since',
          value: formatRelativeDate(primary.row.lastTouchAt, days),
          kind: 'timing',
        });
      }
    }
  } else if (primary.row.title) {
    out.push({ label: 'Ready for', value: primary.row.title, kind: 'context' });
  }

  // Stall context — "4d in stage (past 7d rot threshold)"
  if (data.stall?.daysInStage != null) {
    const dwell = data.stall.daysInStage;
    const rot = data.stall.stageRottingDays;
    const value = rot != null && dwell >= rot
      ? `${dwell}d · past ${rot}d rot threshold`
      : `${dwell}d`;
    out.push({ label: 'Stage dwell', value, kind: 'timing' });
  }

  // Cadence profile — "You typically follow up every 3-5 days"
  if (data.cadence?.typicalDaysBetweenFollowups != null) {
    out.push({
      label: 'Your cadence',
      value: `every ${data.cadence.typicalDaysBetweenFollowups}d between touches`,
      kind: 'behavior',
    });
  } else if (data.cadenceTooltip) {
    // Fallback: use the prebuilt tooltip when the numeric profile isn't present.
    out.push({ label: 'Cadence', value: data.cadenceTooltip, kind: 'behavior' });
  }

  // Event approach — "38 days out" (only if not already in the snapshot strip
  // i.e. suppress when we have the full date, since the strip carries it)
  if (data.urgency.daysOut != null && data.urgency.daysOut <= 14) {
    // Only surface when imminent — the snapshot strip covers the far-out case.
    out.push({
      label: 'Event',
      value: `${data.urgency.daysOut} day${data.urgency.daysOut === 1 ? '' : 's'} out`,
      kind: 'timing',
    });
  }

  // voiceSignals dedupe — skip slug-shaped entries (they're machine flags,
  // not display-ready). Only human-case strings get surfaced.
  for (const sig of data.voiceSignals) {
    if (/[A-Z]|[ ]/.test(sig) && !out.some((e) => e.value === sig)) {
      out.push({ label: 'Signal', value: sig, kind: 'context' });
      if (out.length >= 5) break;
    }
  }

  return out.slice(0, 5);
}

export function formatRelativeDate(iso: string, days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) {
    const weekday = new Date(iso).toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday} (${days}d ago)`;
  }
  return `${days} days ago`;
}

export function humanizeStageTag(tag: string): string {
  const map: Record<string, string> = {
    proposal_sent: 'Proposal',
    contract_out: 'Contract',
    contract_signed: 'Contract Signed',
    deposit_received: 'Deposit Received',
    ready_for_handoff: 'Handoff',
    won: 'Won',
  };
  return map[tag] ?? tag.replace(/_/g, ' ');
}

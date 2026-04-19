'use client';

/**
 * Small presentational primitives for the unified Aion deal card.
 *
 *   - <ConfidenceDot>   — three-tier indicator (Attio pattern; design §20.7).
 *                         filled (high), half-fill (medium), outline (low).
 *   - <WhyThisTooltip>  — priority-breakdown reveal; natural language, no
 *                         raw numbers in copy (design §20.6).
 *   - <SectionHeader>   — Outbound / Pipeline labels inside the card.
 *
 * Kept in one file because they're small and always rendered together.
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import type { PriorityBreakdown } from '../actions/get-aion-card-for-deal';

// ---------------------------------------------------------------------------
// ConfidenceDot
// ---------------------------------------------------------------------------

type Confidence = 'high' | 'medium' | 'low';

export function ConfidenceDot({
  confidence,
  label,
  className,
}: {
  confidence: Confidence;
  label?: string;
  className?: string;
}) {
  const stateClass =
    confidence === 'high'
      ? 'bg-[var(--stage-text-primary)] opacity-90'
      : confidence === 'medium'
        ? 'bg-[var(--stage-text-primary)] opacity-50'
        : 'bg-transparent border border-[var(--stage-text-primary)] opacity-60';

  return (
    <span
      role="img"
      aria-label={label ?? `Confidence: ${confidence}`}
      title={label ?? `Confidence: ${confidence}`}
      className={cn(
        'inline-block size-[7px] rounded-full align-middle shrink-0',
        stateClass,
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// SectionHeader
// ---------------------------------------------------------------------------

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="stage-label tracking-wide uppercase"
      style={{ fontSize: '10px', color: 'var(--stage-text-tertiary, var(--stage-text-secondary))' }}
    >
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// WhyThisTooltip — priority breakdown + optional cadence context
// ---------------------------------------------------------------------------

/**
 * Hover/focus content for the "Why this?" affordance. Natural language only,
 * no raw scores — parenthetical percentages for calibration (design §20.6).
 *
 * Renders as a simple `<details>` so it's accessible and doesn't require a
 * popover primitive. Card rows place this at the end of the row. Screen
 * readers announce the summary; keyboard users Tab into the disclosure.
 */
export function WhyThisTooltip({
  breakdown,
  cadenceTooltip,
  extraReasons = [],
  className,
}: {
  breakdown: PriorityBreakdown;
  cadenceTooltip?: string | null;
  extraReasons?: string[];
  className?: string;
}) {
  const lines = formatBreakdownLines(breakdown);
  const all = [...lines, ...extraReasons, cadenceTooltip].filter(Boolean) as string[];
  if (all.length === 0) return null;

  return (
    <details
      className={cn(
        'group relative inline-block text-xs',
        'text-[var(--stage-text-tertiary,var(--stage-text-secondary))]',
        className,
      )}
    >
      <summary
        className="list-none cursor-help underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-edge-subtle)] rounded-sm"
      >
        Why this?
      </summary>
      <ul
        className={cn(
          'absolute right-0 top-full mt-1 z-10 w-60 rounded-md p-2',
          'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
          'shadow-lg space-y-1',
        )}
        style={{ fontSize: '11px' }}
      >
        {all.map((line, i) => (
          <li key={i} className="leading-snug">
            {line}
          </li>
        ))}
      </ul>
    </details>
  );
}

/**
 * Convert a PriorityBreakdown into natural-language bullets. Only includes
 * multipliers that are non-neutral (≠1.0). Copy rules: parenthetical
 * percentages for calibration; no raw score numbers.
 */
function formatBreakdownLines(b: PriorityBreakdown): string[] {
  const out: string[] = [];
  if (b.daysOutMultiplier !== 1.0) {
    const pct = Math.round((b.daysOutMultiplier - 1.0) * 100);
    out.push(
      pct > 0
        ? `Near-term event (+${pct}%).`
        : `Far-out event (${pct}%).`,
    );
  }
  if (b.dwellMultiplier > 1.0) {
    const pct = Math.round((b.dwellMultiplier - 1.0) * 100);
    out.push(`Past this stage's typical dwell (+${pct}%).`);
  }
  if (b.cadenceMultiplier > 1.0) {
    const pct = Math.round((b.cadenceMultiplier - 1.0) * 100);
    out.push(`Past your typical check-in window (+${pct}%).`);
  }
  if (b.escalation > 0) {
    const pct = Math.round(b.escalation * 100);
    out.push(`Escalating day over day (+${pct}%).`);
  }
  if (b.ceilingApplied) {
    out.push('Capped at your priority ceiling.');
  }
  return out;
}

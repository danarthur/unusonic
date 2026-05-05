'use client';

/**
 * Presentational primitives for the Aion deal card.
 *
 * Post-research redesign (2026-04-19):
 *   - ConfidenceDot removed. Confidence is carried by voice phrasing instead
 *     ("Send today" = high, "Worth considering" = medium, silence = low).
 *     Research: Field Expert found no shipped product using dual confidence
 *     signals (dot + phrasing); Critic flagged the redundancy.
 *   - WhyThisDisclosure replaces the inline `<details>` tooltip pattern.
 *     Lives at the card footer, folded by default, expands in place.
 *   - SectionHeader retained — used sparingly for the Signals block.
 *   - SignalsList — new primitive rendering the evidence under the primary
 *     recommendation.
 */

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { PriorityBreakdown } from '../actions/get-aion-card-for-deal';

// ---------------------------------------------------------------------------
// SectionHeader — small uppercase label used for "Signals"
// ---------------------------------------------------------------------------

export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="stage-label tracking-wide uppercase"
      style={{ color: 'var(--stage-text-tertiary, var(--stage-text-secondary))' }}
    >
      {children}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// SignalsList — evidence list under the primary recommendation.
// ---------------------------------------------------------------------------

export type SignalEntry = {
  /** Short noun phrase — what the signal IS (e.g. "Proposal sent") */
  label: string;
  /** Value — concrete data point (e.g. "Tuesday", "4 days ago") */
  value: string;
  /** Optional kind hint for future visual variance. Not wired yet. */
  kind?: 'timing' | 'behavior' | 'financial' | 'pattern' | 'context';
};

export function SignalsList({ signals }: { signals: SignalEntry[] }) {
  if (signals.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <SectionHeader>Signals</SectionHeader>
      <ul
        className="space-y-1"
        style={{
          fontSize: 'var(--stage-text-body, 13px)',
          color: 'var(--stage-text-secondary)',
        }}
      >
        {signals.map((signal, i) => (
          <li key={i} className="flex gap-2 leading-snug">
            <span
              aria-hidden
              className="shrink-0 select-none"
              style={{ color: 'var(--stage-text-tertiary)' }}
            >
              ·
            </span>
            <span className="min-w-0">
              <span style={{ color: 'var(--stage-text-tertiary)' }}>{signal.label}</span>
              {' '}
              <span>{signal.value}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WhyThisDisclosure — footer-level "Why this ▸" pattern.
// Attio-adjacent: reasoning is always a layer away, never the lead.
// ---------------------------------------------------------------------------

export function WhyThisDisclosure({
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
  const [open, setOpen] = React.useState(false);
  const lines = formatBreakdownLines(breakdown);
  const all = [...lines, ...extraReasons, cadenceTooltip].filter(Boolean) as string[];
  if (all.length === 0) return null;

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          'inline-flex items-center gap-1 text-xs rounded-sm',
          'text-[var(--stage-text-tertiary, var(--stage-text-secondary))]',
          'hover:text-[var(--stage-text-secondary)] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        )}
      >
        Why this
        <ChevronDown
          size={11}
          aria-hidden
          className={cn('transition-transform', open && 'rotate-180')}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            key="why-lines"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_LIGHT}
            className={cn(
              'mt-1.5 overflow-hidden space-y-1 pl-2',
              'border-l border-[var(--stage-edge-subtle)]',
            )}
            style={{
              fontSize: '11px',
              color: 'var(--stage-text-tertiary, var(--stage-text-secondary))',
            }}
          >
            {all.map((line, i) => (
              <li key={i} className="leading-snug">
                {line}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
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

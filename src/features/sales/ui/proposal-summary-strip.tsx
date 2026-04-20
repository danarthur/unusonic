'use client';

/**
 * ProposalSummaryStrip — horizontal top-of-page summary.
 *
 * Replaces the right-rail `ProposalSummaryCard` at the layout level.
 * Shows the 4 canonical numbers (Revenue, Est cost, Margin %, Talent budget)
 * as a scannable strip that stays always visible at the top of the proposal
 * builder, because the User Advocate research called the running total
 * "a nervous tic" that owners glance at constantly.
 *
 * Warning details (floor breach count / total) surface as a tooltip or
 * expand-on-click affordance attached to a warning chip — they're not
 * load-bearing in the strip itself.
 */

import { useState } from 'react';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface ProposalSummaryStripProps {
  totalRevenue: number;
  estimatedCost: number | null;
  floorGapCount: number;
  floorGapTotal: number;
  /** Revenue minus total floor sum — how much is available to spend on talent/extras. */
  talentBudget: number | null;
}

export function ProposalSummaryStrip({
  totalRevenue,
  estimatedCost,
  floorGapCount,
  floorGapTotal,
  talentBudget,
}: ProposalSummaryStripProps) {
  const [warningsOpen, setWarningsOpen] = useState(false);

  const margin = estimatedCost != null ? totalRevenue - estimatedCost : null;
  const marginPercent =
    margin != null && totalRevenue > 0 ? (margin / totalRevenue) * 100 : null;

  const marginColor =
    marginPercent != null
      ? marginPercent >= 35
        ? 'text-[var(--color-unusonic-success)]'
        : marginPercent >= 15
          ? 'text-[var(--color-unusonic-warning)]'
          : 'text-[var(--color-unusonic-error)]'
      : '';

  const talentBudgetPercent =
    talentBudget != null && totalRevenue > 0 ? (talentBudget / totalRevenue) * 100 : null;
  const talentBudgetColor =
    talentBudgetPercent != null
      ? talentBudgetPercent >= 20
        ? 'text-[var(--color-unusonic-success)]'
        : talentBudgetPercent >= 5
          ? 'text-[var(--color-unusonic-warning)]'
          : 'text-[var(--color-unusonic-error)]'
      : '';

  const hasWarnings = floorGapCount > 0 || (marginPercent != null && marginPercent < 15);

  return (
    <div
      data-surface="elevated"
      className="flex-shrink-0 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]"
    >
      <div className="flex items-center gap-6 px-5 py-3 overflow-x-auto">
        {/* Revenue — the anchor. Visually dominant. */}
        <div className="flex flex-col shrink-0 min-w-[120px]">
          <span className="stage-label text-[var(--stage-text-secondary)]">Revenue</span>
          <span className="tabular-nums text-[var(--stage-text-primary)] font-semibold text-xl leading-tight tracking-tight">
            ${totalRevenue.toLocaleString()}
          </span>
        </div>

        <div className="h-8 w-px bg-[var(--stage-edge-subtle)] shrink-0" aria-hidden />

        {/* Est. cost */}
        {estimatedCost != null ? (
          <SummaryMetric label="Est. cost" value={`$${estimatedCost.toLocaleString()}`} />
        ) : (
          <SummaryMetric label="Est. cost" value="—" muted />
        )}

        {/* Margin */}
        {margin != null && marginPercent != null ? (
          <SummaryMetric
            label="Margin"
            value={`$${margin.toLocaleString()} (${Math.round(marginPercent)}%)`}
            valueClassName={cn('font-medium', marginColor)}
          />
        ) : (
          <SummaryMetric label="Margin" value="—" muted />
        )}

        {/* Talent budget */}
        {talentBudget != null ? (
          <SummaryMetric
            label={talentBudget < 0 ? 'Over budget' : 'Talent budget'}
            value={`${talentBudget < 0 ? '-' : ''}$${Math.abs(talentBudget).toLocaleString()}`}
            valueClassName={cn('font-medium', talentBudgetColor)}
          />
        ) : (
          <SummaryMetric label="Talent budget" value="—" muted />
        )}

        {/* Spacer so warnings sit flush right */}
        <div className="flex-1" aria-hidden />

        {/* Warning chip — only when there's something to warn about. */}
        {hasWarnings && (
          <button
            type="button"
            onClick={() => setWarningsOpen((v) => !v)}
            aria-expanded={warningsOpen}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 rounded-[var(--stage-radius-input)] border border-[var(--color-unusonic-warning)]/30 bg-[var(--color-unusonic-warning)]/10 text-[var(--color-unusonic-warning)] text-sm hover:border-[var(--color-unusonic-warning)]/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
            <span className="font-medium">
              {floorGapCount > 0
                ? `${floorGapCount} below floor`
                : 'Low margin'}
            </span>
            <ChevronDown
              className={cn('w-3.5 h-3.5 transition-transform', warningsOpen && 'rotate-180')}
              strokeWidth={1.5}
              aria-hidden
            />
          </button>
        )}
      </div>

      {/* Expanded warning detail — only when the chip is toggled. */}
      {hasWarnings && warningsOpen && (
        <div className="px-5 py-3 border-t border-[var(--stage-edge-subtle)] text-sm text-[var(--stage-text-secondary)] space-y-1">
          {floorGapCount > 0 && (
            <p>
              <span className="text-[var(--color-unusonic-warning)] font-medium">
                {floorGapCount} line item{floorGapCount !== 1 ? 's' : ''}
              </span>{' '}
              priced below the catalog floor — total gap ${floorGapTotal.toLocaleString()}.
            </p>
          )}
          {marginPercent != null && marginPercent < 15 && (
            <p>
              Margin is{' '}
              <span className={cn('font-medium', marginColor)}>
                {Math.round(marginPercent)}%
              </span>{' '}
              — below the 15% healthy threshold for this workspace.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  valueClassName,
  muted = false,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col shrink-0 min-w-[92px]">
      <span className="stage-label text-[var(--stage-text-secondary)]">{label}</span>
      <span
        className={cn(
          'tabular-nums text-sm leading-tight',
          muted ? 'text-[var(--stage-text-tertiary)]' : 'text-[var(--stage-text-primary)]',
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}

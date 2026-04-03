'use client';

import { cn } from '@/shared/lib/utils';

export interface ProposalSummaryCardProps {
  totalRevenue: number;
  estimatedCost: number | null;
  floorGapCount: number;
  floorGapTotal: number;
  /** Revenue minus total floor sum — how much is available to spend on talent/extras. */
  talentBudget: number | null;
}

export function ProposalSummaryCard({
  totalRevenue,
  estimatedCost,
  floorGapCount,
  floorGapTotal,
  talentBudget,
}: ProposalSummaryCardProps) {
  const margin = estimatedCost != null ? totalRevenue - estimatedCost : null;
  const marginPercent =
    margin != null && totalRevenue > 0 ? (margin / totalRevenue) * 100 : null;

  const marginColor =
    marginPercent != null
      ? marginPercent >= 35
        ? 'text-emerald-400'
        : marginPercent >= 15
          ? 'text-amber-400'
          : 'text-red-400'
      : '';

  // Talent budget color: green > 20% of revenue, amber 5-20%, red < 5% or negative
  const talentBudgetPercent =
    talentBudget != null && totalRevenue > 0
      ? (talentBudget / totalRevenue) * 100
      : null;
  const talentBudgetColor =
    talentBudgetPercent != null
      ? talentBudgetPercent >= 20
        ? 'text-emerald-400'
        : talentBudgetPercent >= 5
          ? 'text-amber-400'
          : 'text-red-400'
      : '';

  if (totalRevenue === 0 && estimatedCost == null && floorGapCount === 0) {
    return null;
  }

  return (
    <div
      data-surface="elevated"
      className="rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-5 space-y-3"
    >
      <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
        Proposal health
      </h3>

      <div className="space-y-2 text-sm">
        {/* Revenue */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-[var(--stage-text-secondary)]">Revenue</span>
          <span className="tabular-nums text-[var(--stage-text-primary)] font-medium">
            ${totalRevenue.toLocaleString()}
          </span>
        </div>

        {/* Estimated cost */}
        {estimatedCost != null && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-[var(--stage-text-secondary)]">Est. cost</span>
            <span className="tabular-nums text-[var(--stage-text-primary)]">
              ${estimatedCost.toLocaleString()}
            </span>
          </div>
        )}

        {/* Margin */}
        {margin != null && marginPercent != null && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-[var(--stage-edge-subtle)]">
            <span className="text-[var(--stage-text-secondary)]">Margin</span>
            <span className={cn('tabular-nums font-medium', marginColor)}>
              ${margin.toLocaleString()} ({Math.round(marginPercent)}%)
            </span>
          </div>
        )}

        {/* Talent budget */}
        {talentBudget != null && (
          <div className="flex items-center justify-between gap-4 pt-1 border-t border-[var(--stage-edge-subtle)]">
            <span className="text-[var(--stage-text-secondary)]">
              {talentBudget < 0 ? '\u26A0 Over budget' : 'Talent budget'}
            </span>
            <span className={cn('tabular-nums font-medium', talentBudgetColor)}>
              {talentBudget < 0 ? '-' : ''}${Math.abs(talentBudget).toLocaleString()}
            </span>
          </div>
        )}

        {/* Floor warning */}
        {floorGapCount > 0 && (
          <div className="flex items-start gap-2 pt-2 border-t border-[var(--stage-edge-subtle)] text-xs text-amber-400">
            <span className="shrink-0 mt-px">&#9888;</span>
            <span>
              {floorGapCount} item{floorGapCount !== 1 ? 's' : ''} below floor (-${floorGapTotal.toLocaleString()} total)
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

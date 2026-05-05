'use client';

import { DollarSign } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';

type BudgetReferenceCardProps = {
  budgetEstimated: number | null;
  proposalTotal: number | null;
  ledgerActual?: number | null;
};

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BudgetReferenceCard({
  budgetEstimated,
  proposalTotal,
  ledgerActual,
}: BudgetReferenceCardProps) {
  // Don't render if no financial data at all
  if (budgetEstimated == null && proposalTotal == null && ledgerActual == null) return null;

  const delta =
    budgetEstimated != null && proposalTotal != null
      ? ((proposalTotal - budgetEstimated) / budgetEstimated) * 100
      : null;

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      <div className="flex items-center gap-3 mb-4">
        <DollarSign size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
        <h3 className="stage-label">Budget</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {budgetEstimated != null && (
          <div>
            <p className="stage-label text-[var(--stage-text-tertiary)] truncate">Estimated</p>
            <p className="stage-readout">{fmt(budgetEstimated)}</p>
          </div>
        )}
        {proposalTotal != null && (
          <div>
            <p className="stage-label text-[var(--stage-text-tertiary)] truncate">Quoted</p>
            <p className="stage-readout">
              {fmt(proposalTotal)}
              {delta != null && (
                <span className={`ml-1 text-xs ${delta > 0 ? 'text-[var(--color-unusonic-warning)]' : 'text-[var(--color-unusonic-success)]'}`}>
                  {delta > 0 ? '+' : ''}{delta.toFixed(0)}%
                </span>
              )}
            </p>
          </div>
        )}
        {ledgerActual != null && (
          <div className="col-span-2">
            <p className="stage-label text-[var(--stage-text-tertiary)] truncate">Actual</p>
            <p className="stage-readout">{fmt(ledgerActual)}</p>
          </div>
        )}
      </div>
    </StagePanel>
  );
}

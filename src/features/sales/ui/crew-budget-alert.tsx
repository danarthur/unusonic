'use client';

import { cn } from '@/shared/lib/utils';

export interface CrewBudgetAlertProps {
  estimatedCrewCost: number;
  actualCrewCost: number;
}

/**
 * Renders an alert bar when actual crew cost exceeds the proposal estimate.
 * Amber when over budget; red when overage > 20% of estimate.
 * Renders nothing when actual is within estimate.
 */
export function CrewBudgetAlert({
  estimatedCrewCost,
  actualCrewCost,
}: CrewBudgetAlertProps) {
  if (actualCrewCost <= estimatedCrewCost) return null;

  const overage = actualCrewCost - estimatedCrewCost;
  const overagePercent = estimatedCrewCost > 0 ? (overage / estimatedCrewCost) * 100 : 100;
  const isRed = overagePercent > 20;

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-[var(--stage-radius-input)] px-4 py-3 text-sm',
        isRed
          ? 'bg-[oklch(0.35_0.06_25)] text-[var(--color-unusonic-error)]'
          : 'bg-[oklch(0.35_0.06_80)] text-[var(--color-unusonic-warning)]'
      )}
    >
      <span className="shrink-0" aria-hidden>&#9888;</span>
      <span>
        Crew cost (<span className="tabular-nums font-medium">${actualCrewCost.toLocaleString()}</span>)
        {' '}exceeds proposal estimate (<span className="tabular-nums">${estimatedCrewCost.toLocaleString()}</span>)
        {' '}by <span className="tabular-nums font-medium">${overage.toLocaleString()}</span>
      </span>
    </div>
  );
}

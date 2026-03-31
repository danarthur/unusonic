'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface MarginProgressBarProps {
  /** Margin percentage 0–100. ((overridePrice - actualCost) / overridePrice) * 100 */
  marginPercent: number;
  className?: string;
  showWarningIcon?: boolean;
}

/** Green >40%, Yellow 20–40%, Red <20%. */
export function MarginProgressBar({
  marginPercent,
  className,
  showWarningIcon = true,
}: MarginProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, marginPercent));
  const isGreen = clamped >= 40;
  const isYellow = clamped >= 20 && clamped < 40;
  const isRed = clamped < 20;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
          Margin
        </span>
        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            isGreen && 'text-[var(--color-unusonic-success)]',
            isYellow && 'text-[var(--color-unusonic-warning)]',
            isRed && 'text-[var(--color-unusonic-error)]'
          )}
        >
          {Number.isFinite(marginPercent) ? `${marginPercent.toFixed(1)}%` : '—'}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[oklch(1_0_0_/_0.05)]">
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-100',
            isGreen && 'bg-[var(--color-unusonic-success)]',
            isYellow && 'bg-[var(--color-unusonic-warning)]',
            isRed && 'bg-[var(--color-unusonic-error)]'
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {isRed && showWarningIcon && (
        <p className="flex items-center gap-1.5 text-xs text-[var(--color-unusonic-error)]">
          <AlertTriangle size={14} aria-hidden />
          Margin below 20%
        </p>
      )}
    </div>
  );
}

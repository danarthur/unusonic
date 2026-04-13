'use client';

import type { FeasibilityStatus } from '../../actions/check-date-feasibility';
import { cn } from '@/shared/lib/utils';

export function FeasibilityBadge({ status, message }: { status: FeasibilityStatus; message: string }) {
  const styles: Record<FeasibilityStatus, string> = {
    clear: 'border-[var(--color-unusonic-success)]/40 bg-[var(--color-unusonic-success)]/10 text-[var(--color-unusonic-success)]',
    caution: 'border-[var(--color-unusonic-warning)]/40 bg-[var(--color-unusonic-warning)]/10 text-[var(--color-unusonic-warning)]',
    critical: 'border-[var(--color-unusonic-error)]/40 bg-[var(--color-unusonic-error)]/10 text-[var(--color-unusonic-error)]',
  };
  const dots: Record<FeasibilityStatus, string> = {
    clear: 'bg-[var(--color-unusonic-success)]',
    caution: 'bg-[var(--color-unusonic-warning)]',
    critical: 'bg-[var(--color-unusonic-error)]',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 py-1.5 text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight',
        styles[status]
      )}
      role="status"
    >
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dots[status])} aria-hidden />
      {message}
    </span>
  );
}

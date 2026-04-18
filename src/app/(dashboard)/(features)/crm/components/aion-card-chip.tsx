'use client';

/**
 * AionCardChip — compact stream-rail indicator that tells the owner "this
 * deal has an Aion suggestion worth clicking through to." No full card
 * content; just a one-line affordance with the right density for the
 * 380px-wide left rail on /crm.
 *
 * Reads from the batch prefetch `getAionCardSummariesForDeals` (design §20.5,
 * §P1-1). The parent container passes the pre-fetched summary — chip does
 * not self-fetch.
 *
 * Click-through behavior: Phase 3 emits a plain click event; Deal Lens
 * already opens when a stream card is selected, so the chip just labels
 * what's waiting. Phase 4 optionally adds a direct-focus behavior.
 */

import { cn } from '@/shared/lib/utils';
import type { AionCardSummary } from '../actions/get-aion-card-for-deal';

export type AionCardChipProps = {
  summary: AionCardSummary | null;
  className?: string;
};

export function AionCardChip({ summary, className }: AionCardChipProps) {
  if (!summary) return null;
  const { hasOutbound, hasPipeline } = summary;
  if (!hasOutbound && !hasPipeline) return null;

  const label = chipLabel(hasOutbound, hasPipeline);

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5',
        'text-[10px] uppercase tracking-wide',
        'text-[var(--stage-text-tertiary,var(--stage-text-secondary))]',
        'bg-[color:color-mix(in_oklch,var(--stage-text-primary)_6%,transparent)]',
        className,
      )}
      aria-label={`Aion has ${label}`}
    >
      <span aria-hidden>★</span>
      <span>{label}</span>
    </div>
  );
}

function chipLabel(hasOutbound: boolean, hasPipeline: boolean): string {
  if (hasOutbound && hasPipeline) return 'Aion · 2';
  if (hasPipeline) return 'Advance';
  return 'Nudge';
}

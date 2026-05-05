'use client';

import { ArrowLeft } from 'lucide-react';
import { TimePicker } from '@/shared/ui/time-picker';
import { formatTime12h } from '@/shared/lib/parse-time';
import { updateDealScalars } from '../../../actions/update-deal-scalars';
import { useRouter } from 'next/navigation';
import type { DealDetail } from '../../../actions/get-deal';

export function ProposalBuilderHeader({ dealId, deal }: { dealId: string; deal: DealDetail }) {
  const router = useRouter();

  const handleTimeSave = async (patch: { event_start_time?: string | null; event_end_time?: string | null }) => {
    await updateDealScalars(dealId, patch);
    router.refresh();
  };

  const dateLabel = deal.proposed_date
    ? new Date(deal.proposed_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <header data-surface="surface" className="relative z-20 shrink-0 flex items-center gap-4 px-4 py-3 sm:px-6 sm:py-4 border-b border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]">
      <a
        href={`/events?selected=${dealId}`}
        className="p-2 -ml-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]"
        aria-label="Back to deal"
      >
        <ArrowLeft size={20} />
      </a>
      <div className="min-w-0 flex-1">
        <p className="stage-label">
          Proposal builder
        </p>
        <h1 className="text-xl font-medium text-[var(--stage-text-primary)] tracking-tight truncate mt-0.5">
          {deal.title ?? 'Untitled event'}
        </h1>
      </div>

      {/* Date + Times */}
      <div className="hidden sm:flex items-center gap-1.5 shrink-0 text-sm text-[var(--stage-text-secondary)]">
        {dateLabel && (
          <span className="tracking-tight tabular-nums whitespace-nowrap">{dateLabel}</span>
        )}
        {dateLabel && <span className="text-[var(--stage-text-tertiary)] select-none mx-0.5">&middot;</span>}
        <TimePicker
          value={deal.event_start_time ?? null}
          onChange={(v) => handleTimeSave({ event_start_time: v })}
          placeholder="Start"
          context="evening"
          variant="ghost"
        />
        <span className="text-[var(--stage-text-tertiary)] select-none">–</span>
        <TimePicker
          value={deal.event_end_time ?? null}
          onChange={(v) => handleTimeSave({ event_end_time: v })}
          placeholder="End"
          context="evening"
          variant="ghost"
        />
      </div>
    </header>
  );
}

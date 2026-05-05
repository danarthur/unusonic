'use client';

import { useEffect, useState, useTransition } from 'react';
import { CopyCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { applyCrewToSeries } from '../actions/apply-crew-to-series';
import { getDealShows } from '../actions/get-deal-shows';

/**
 * "Set for whole series" affordance rendered above the Production Team Card
 * for series deals. Fans out the first show's crew to every live event and
 * persists it as the project's series_crew_template so future "Add date"
 * calls auto-propagate.
 *
 * Only renders when the deal's project has is_series = true. For singletons
 * this component returns null.
 */
export function SeriesCrewAffordance({ dealId, isLocked = false }: { dealId: string; isLocked?: boolean }) {
  const [isSeries, setIsSeries] = useState<boolean | null>(null);
  const [showCount, setShowCount] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getDealShows(dealId).then((r) => {
      if (cancelled || !r.success) return;
      setIsSeries(r.isSeries);
      setShowCount(r.shows.filter((s) => !s.archived_at).length);
    });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (isSeries !== true) return null;

  const handleApply = () => {
    startTransition(async () => {
      const r = await applyCrewToSeries(dealId);
      if (r.success) {
        toast.success(`Crew applied to ${r.appliedEvents} show${r.appliedEvents === 1 ? '' : 's'} · ${r.writtenRows} new assignment${r.writtenRows === 1 ? '' : 's'}`);
      } else {
        toast.error(r.error);
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-[var(--stage-radius-input,6px)] border border-dashed border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] min-w-0">
      <div className="min-w-0 flex flex-col gap-0.5">
        <span className="text-[length:var(--stage-input-font-size,13px)] font-medium text-[var(--stage-text-primary)] tracking-tight">
          Set crew for whole series
        </span>
        <span className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">
          Copies the first show&apos;s roster to all {showCount} show{showCount === 1 ? '' : 's'}. New dates added later inherit it.
        </span>
      </div>
      <button
        type="button"
        disabled={pending || isLocked}
        onClick={handleApply}
        className="shrink-0 flex items-center gap-1.5 px-3 h-[var(--stage-input-height,34px)] rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.12)] bg-[var(--ctx-card)] hover:bg-[oklch(1_0_0_/_0.08)] text-[length:var(--stage-input-font-size,13px)] font-medium text-[var(--stage-text-primary)] disabled:opacity-45 disabled:pointer-events-none"
      >
        {pending ? <Loader2 size={12} className="animate-spin" strokeWidth={1.5} /> : <CopyCheck size={12} strokeWidth={1.5} />}
        Apply
      </button>
    </div>
  );
}

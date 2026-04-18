'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { CalendarX, ChevronRight, Plus, RotateCcw, Users, X } from 'lucide-react';
import { getDealShows, type DealShow, type GetDealShowsResult } from '../actions/get-deal-shows';
import { cancelDealShow, restoreDealShow } from '../actions/cancel-deal-show';
import { addShowToSeries } from '../actions/add-show-to-series';
import { CalendarPanel, parseLocalDateString } from './ceramic-date-picker';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export type DealShowsListProps = {
  dealId: string;
  isLocked?: boolean;
};

/**
 * Shows (N) list for a deal. Only renders when the deal's project has
 * is_series = true. Singletons and multi-day deals keep the single-event
 * Plan tab unchanged.
 *
 * Row content: date, status chip, crew count, divergence indicator. Row
 * actions (cancel / restore / open run of show) live in a menu — P0 keeps
 * the affordance minimal; Reschedule + Override Pricing ship in P1.
 */
export function DealShowsList({ dealId, isLocked = false }: DealShowsListProps) {
  const [result, setResult] = useState<GetDealShowsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getDealShows(dealId);
      setResult(r);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    load();
  }, [load]);

  // Only render the section for series deals. Singletons/multi-day use the
  // existing Plan tab which targets a single event.
  if (loading) {
    return (
      <div className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">
        Loading shows…
      </div>
    );
  }
  if (!result?.success) return null;
  if (!result.isSeries) return null;

  const { shows } = result;
  const activeShows = shows.filter((s) => !s.archived_at);
  const canceledShows = shows.filter((s) => !!s.archived_at);

  const handleCancel = async (eventId: string) => {
    startTransition(async () => {
      const r = await cancelDealShow(eventId);
      if (r.success) await load();
    });
  };
  const handleRestore = async (eventId: string) => {
    startTransition(async () => {
      const r = await restoreDealShow(eventId);
      if (r.success) await load();
    });
  };
  const handleAdd = async (newDate: string) => {
    startTransition(async () => {
      const r = await addShowToSeries(dealId, newDate);
      if (r.success) {
        setAddOpen(false);
        await load();
      }
    });
  };

  return (
    <section
      data-surface="elevated"
      className="rounded-[var(--stage-radius-panel,12px)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] p-4 flex flex-col gap-3 min-w-0"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h3 className="text-[length:var(--stage-input-font-size,13px)] font-medium tracking-tight text-[var(--stage-text-primary)]">
            Shows ({activeShows.length}{canceledShows.length > 0 ? `, ${canceledShows.length} canceled` : ''})
          </h3>
          {result.seriesArchetype && (
            <span className="text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)] capitalize">
              {result.seriesArchetype}
            </span>
          )}
        </div>
        {!isLocked && (
          <button
            type="button"
            onClick={() => setAddOpen((o) => !o)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:bg-[oklch(1_0_0_/_0.08)] text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]"
          >
            <Plus size={12} strokeWidth={1.5} />
            Add date
          </button>
        )}
      </header>

      <AnimatePresence>
        {addOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_LIGHT}
            className="overflow-hidden"
          >
            <CalendarPanel value="" onChange={handleAdd} onClose={() => setAddOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-1 min-w-0">
        {activeShows.map((s) => (
          <ShowRow key={s.id} show={s} onCancel={handleCancel} busy={pending} isLocked={isLocked} />
        ))}
        {canceledShows.length > 0 && (
          <>
            <div className="mt-2 pt-2 border-t border-[oklch(1_0_0_/_0.04)] text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-tertiary)]">
              Canceled
            </div>
            {canceledShows.map((s) => (
              <ShowRow
                key={s.id}
                show={s}
                onRestore={handleRestore}
                busy={pending}
                isLocked={isLocked}
              />
            ))}
          </>
        )}
      </div>
    </section>
  );
}

function ShowRow({
  show,
  onCancel,
  onRestore,
  busy,
  isLocked,
}: {
  show: DealShow;
  onCancel?: (id: string) => void;
  onRestore?: (id: string) => void;
  busy: boolean;
  isLocked: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const isCanceled = !!show.archived_at;
  const startsDate = useMemo(() => new Date(show.starts_at), [show.starts_at]);
  const dateLabel = useMemo(() => format(startsDate, 'EEE MMM d'), [startsDate]);
  const lifecycle = show.lifecycle_status ?? show.status;

  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-[var(--stage-radius-input,6px)] hover:bg-[oklch(1_0_0_/_0.04)] min-w-0 transition-colors',
        isCanceled && 'opacity-60',
      )}
    >
      <Link
        href={`/events/${show.id}`}
        className="flex items-center gap-3 flex-1 min-w-0 text-[length:var(--stage-input-font-size,13px)] tracking-tight"
      >
        <span className={cn('shrink-0 font-medium', isCanceled ? 'text-[var(--stage-text-tertiary)] line-through' : 'text-[var(--stage-text-primary)]')}>
          {dateLabel}
        </span>
        <StatusChip status={lifecycle} isCanceled={isCanceled} />
        <span className="flex items-center gap-1 text-[var(--stage-text-secondary)] min-w-0">
          <Users size={11} strokeWidth={1.5} className="shrink-0" />
          {show.crew_count}
        </span>
        {show.diverged_from_series_at && (
          <span className="text-[var(--stage-text-tertiary)] text-[11px] shrink-0">
            Overridden
          </span>
        )}
        <span className="ml-auto hidden group-hover:inline-flex items-center text-[var(--stage-text-tertiary)] shrink-0">
          <ChevronRight size={12} strokeWidth={1.5} />
        </span>
      </Link>

      {!isLocked && (
        <>
          <button
            ref={triggerRef}
            type="button"
            disabled={busy}
            onClick={() => setMenuOpen((o) => !o)}
            className="shrink-0 p-1 rounded-[var(--stage-radius-input,6px)] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Show actions"
          >
            {isCanceled ? <RotateCcw size={12} strokeWidth={1.5} /> : <X size={12} strokeWidth={1.5} />}
          </button>
          {menuOpen && createPortal(
            <div className="fixed inset-0 z-[60]" onMouseDown={() => setMenuOpen(false)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={STAGE_LIGHT}
                data-surface="raised"
                onMouseDown={(e) => e.stopPropagation()}
                style={(() => {
                  const rect = triggerRef.current?.getBoundingClientRect();
                  if (!rect) return {};
                  return {
                    position: 'fixed' as const,
                    right: window.innerWidth - rect.right,
                    top: rect.bottom + 4,
                    minWidth: 160,
                  };
                })()}
                className="rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)] overflow-hidden"
              >
                {isCanceled ? (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onRestore?.(show.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]"
                  >
                    <RotateCcw size={12} strokeWidth={1.5} /> Restore show
                  </button>
                ) : (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onCancel?.(show.id);
                      setMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]"
                  >
                    <CalendarX size={12} strokeWidth={1.5} /> Cancel this show
                  </button>
                )}
                <Link
                  href={`/events/${show.id}`}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]"
                >
                  <ChevronRight size={12} strokeWidth={1.5} /> Open run of show
                </Link>
              </motion.div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}

function StatusChip({ status, isCanceled }: { status: string | null; isCanceled: boolean }) {
  let label: string;
  let bg = 'oklch(1 0 0 / 0.08)';
  let fg = 'var(--stage-text-secondary)';
  if (isCanceled) {
    label = 'Canceled';
    bg = 'oklch(0.2 0 0 / 0.35)';
    fg = 'var(--stage-text-tertiary)';
  } else {
    switch (status) {
      case 'wrapped':
        label = 'Wrapped';
        break;
      case 'in_show':
        label = 'Live';
        bg = 'var(--color-unusonic-success, oklch(0.74 0.17 142 / 0.25))';
        fg = 'var(--color-unusonic-success, oklch(0.74 0.17 142))';
        break;
      case 'production':
      case 'planned':
        label = 'Confirmed';
        break;
      case 'lead':
      case 'inquiry':
        label = 'Tentative';
        break;
      default:
        label = status ?? 'Scheduled';
    }
  }
  return (
    <span
      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wide font-medium"
      style={{ backgroundColor: bg, color: fg }}
    >
      {label}
    </span>
  );
}

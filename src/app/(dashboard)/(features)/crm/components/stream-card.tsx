'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, XCircle, Archive, TrendingDown, CalendarClock, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { UNUSONIC_PHYSICS } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { cancelEvent } from '../actions/delete-event';
import { archiveDeal } from '../actions/archive-deal';
import { reopenDeal } from '../actions/reopen-deal';
import { rescheduleEvent } from '../actions/reschedule-event';
import { updateDealStatus } from '../actions/update-deal-status';

export type StreamCardItem = {
  id: string;
  title: string | null;
  status: string | null;
  event_date: string | null;
  location: string | null;
  client_name: string | null;
  source: 'deal' | 'event';
  lifecycle_status?: string | null;
  /** Sales = amber, Ops = blue, Finance = rose */
  mode?: 'sales' | 'ops' | 'finance';
};

const glowBorderClass: Record<NonNullable<StreamCardItem['mode']>, string> = {
  sales: 'border-l-[var(--color-neon-amber)]',
  ops: 'border-l-[var(--color-neon-blue)]',
  finance: 'border-l-[var(--color-neon-rose)]',
};

export function StreamCard({
  item,
  selected,
  onClick,
  className,
}: {
  item: StreamCardItem;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  const mode = item.mode ?? (item.source === 'deal' ? 'sales' : 'ops');
  const glowClass = glowBorderClass[mode];

  // Two-step confirm state: null | 'cancel' | 'archive' | 'lost'
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'archive' | 'lost' | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Reschedule inline input state
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(item.event_date ?? '');
  const rescheduleInputRef = useRef<HTMLInputElement>(null);

  // Stable ref so the timer can be cleared on re-click or unmount
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Focus the date input when reschedule panel opens
  useEffect(() => {
    if (rescheduleOpen && rescheduleInputRef.current) {
      rescheduleInputRef.current.focus();
    }
  }, [rescheduleOpen]);

  const startConfirmTimer = useCallback((action: 'cancel' | 'archive' | 'lost') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setConfirmAction(action);
    timerRef.current = setTimeout(() => {
      setConfirmAction((prev) => (prev === action ? null : prev));
    }, 3000);
  }, []);

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmAction !== 'cancel') {
      startConfirmTimer('cancel');
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPending(true);
    const result = await cancelEvent(item.id);
    setIsPending(false);
    setConfirmAction(null);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to cancel event');
    }
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmAction !== 'archive') {
      startConfirmTimer('archive');
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPending(true);
    const result = await archiveDeal(item.id);
    setIsPending(false);
    setConfirmAction(null);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to archive deal');
    }
  };

  const handleMarkLost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmAction !== 'lost') {
      startConfirmTimer('lost');
      return;
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPending(true);
    const result = await updateDealStatus(item.id, 'lost');
    setIsPending(false);
    setConfirmAction(null);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to mark deal as lost');
    }
  };

  const handleReopen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPending(true);
    const result = await reopenDeal(item.id);
    setIsPending(false);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to reopen deal');
    }
  };

  const handleRescheduleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRescheduleOpen((prev) => !prev);
  };

  const handleRescheduleConfirm = async () => {
    if (!rescheduleDate) return;
    setIsPending(true);
    const result = await rescheduleEvent(item.id, rescheduleDate);
    setIsPending(false);
    if (result.success) {
      setRescheduleOpen(false);
    } else {
      toast.error(result.error ?? 'Failed to reschedule event');
    }
  };

  const handleRescheduleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRescheduleConfirm();
    } else if (e.key === 'Escape') {
      setRescheduleOpen(false);
      setRescheduleDate(item.event_date ?? '');
    }
  };

  const isEvent = item.source === 'event';
  const isDeal = item.source === 'deal';
  const isLost = item.status === 'lost';
  const showDealArchiveButtons =
    isDeal && (item.status === 'inquiry' || item.status === 'proposal' || item.status === 'contract_sent' || item.status === 'contract_signed');
  const showDealLostButton =
    isDeal &&
    (item.status === 'inquiry' || item.status === 'proposal' || item.status === 'contract_sent' || item.status === 'contract_signed');
  const showReopenButton = isDeal && isLost;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={UNUSONIC_PHYSICS}
      className={cn(className)}
    >
      <motion.div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          transition={UNUSONIC_PHYSICS}
          className="w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] rounded-2xl"
        >
          <LiquidPanel
            hoverEffect
            className={cn(
              'liquid-card p-4 border-l-4 min-h-0 rounded-[28px]',
              glowClass,
              selected && 'ring-2 ring-[var(--color-neon-blue)] ring-offset-2 ring-offset-[var(--color-obsidian)]',
              item.lifecycle_status === 'cancelled' && 'opacity-60'
            )}
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-ceramic font-medium tracking-tight truncate leading-none">
                  {item.title ?? 'Untitled Production'}
                </h3>
                <div className="flex items-center gap-1.5 shrink-0">
                  {item.lifecycle_status === 'cancelled' && (
                    <span className="text-xs uppercase tracking-widest text-ink-muted font-medium">
                      cancelled
                    </span>
                  )}
                  {!item.lifecycle_status?.includes('cancelled') && item.status && (
                    <span className="text-xs uppercase tracking-widest text-ink-muted font-medium">
                      {item.status.replace(/_/g, ' ')}
                    </span>
                  )}

                  {/* Deal: Reopen (lost deals only) */}
                  {showReopenButton && (
                    <button
                      type="button"
                      onClick={handleReopen}
                      disabled={isPending}
                      aria-label="Reopen deal"
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-colors focus:outline-none text-white/40 hover:text-white/70 border border-white/10 bg-white/5"
                    >
                      <RotateCcw size={11} aria-hidden />
                    </button>
                  )}

                  {/* Deal: Archive button */}
                  {showDealArchiveButtons && (
                    <button
                      type="button"
                      onClick={handleArchive}
                      disabled={isPending}
                      aria-label={confirmAction === 'archive' ? 'Confirm archive' : 'Archive deal'}
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-colors focus:outline-none',
                        confirmAction === 'archive'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'text-white/40 hover:text-white/70 border border-white/10 bg-white/5'
                      )}
                    >
                      <Archive size={11} aria-hidden />
                      {confirmAction === 'archive' ? 'Confirm?' : null}
                    </button>
                  )}

                  {/* Deal: Mark lost button */}
                  {showDealLostButton && (
                    <button
                      type="button"
                      onClick={handleMarkLost}
                      disabled={isPending}
                      aria-label={confirmAction === 'lost' ? 'Confirm mark lost' : 'Mark deal as lost'}
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-colors focus:outline-none',
                        confirmAction === 'lost'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'text-white/40 hover:text-white/70 border border-white/10 bg-white/5'
                      )}
                    >
                      <TrendingDown size={11} aria-hidden />
                      {confirmAction === 'lost' ? 'Confirm?' : null}
                    </button>
                  )}

                  {/* Event: Reschedule button */}
                  {isEvent && item.lifecycle_status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={handleRescheduleToggle}
                      disabled={isPending}
                      aria-label="Reschedule event"
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-colors focus:outline-none',
                        rescheduleOpen
                          ? 'bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)] border border-[var(--color-neon-blue)]/40'
                          : 'text-white/40 hover:text-white/70 border border-white/10 bg-white/5'
                      )}
                    >
                      <CalendarClock size={11} aria-hidden />
                    </button>
                  )}

                  {/* Event: Cancel button */}
                  {isEvent && item.lifecycle_status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isPending}
                      aria-label={confirmAction === 'cancel' ? 'Confirm cancel' : 'Mark as cancelled'}
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium transition-colors focus:outline-none',
                        confirmAction === 'cancel'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'text-white/40 hover:text-white/70 border border-white/10 bg-white/5'
                      )}
                    >
                      <XCircle size={11} aria-hidden />
                      {confirmAction === 'cancel' ? 'Confirm?' : null}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm text-ink-muted leading-relaxed truncate">{item.client_name ?? 'Client'}</p>
              <div className="flex items-center gap-3 text-xs text-ink-muted mt-1">
                <span className="flex items-center gap-1.5">
                  <Clock size={12} className="shrink-0 text-ink-muted" aria-hidden />
                  {item.event_date
                    ? new Date(item.event_date).toLocaleDateString()
                    : 'TBD'}
                </span>
                <span className="flex items-center gap-1.5 truncate">
                  <MapPin size={12} className="shrink-0 text-ink-muted" aria-hidden />
                  {item.location?.split(',')[0] ?? 'TBD'}
                </span>
              </div>

              {/* Reschedule inline date input */}
              <AnimatePresence>
                {rescheduleOpen && (
                  <motion.div
                    key="reschedule-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={UNUSONIC_PHYSICS}
                    className="overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
                      <input
                        ref={rescheduleInputRef}
                        type="date"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                        onKeyDown={handleRescheduleKeyDown}
                        disabled={isPending}
                        className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-ceramic focus:outline-none focus:border-[var(--color-neon-blue)]/60 disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRescheduleConfirm(); }}
                        disabled={isPending || !rescheduleDate}
                        aria-label="Confirm reschedule"
                        className="flex items-center justify-center w-6 h-6 rounded-md bg-[var(--color-neon-blue)]/20 text-[var(--color-neon-blue)] border border-[var(--color-neon-blue)]/40 text-xs font-medium transition-colors hover:bg-[var(--color-neon-blue)]/30 disabled:opacity-50 focus:outline-none"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setRescheduleOpen(false); setRescheduleDate(item.event_date ?? ''); }}
                        aria-label="Cancel reschedule"
                        className="flex items-center justify-center w-6 h-6 rounded-md text-white/40 border border-white/10 bg-white/5 text-xs font-medium transition-colors hover:text-white/70 focus:outline-none"
                      >
                        ✕
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </LiquidPanel>
        </motion.div>
    </motion.div>
  );
}

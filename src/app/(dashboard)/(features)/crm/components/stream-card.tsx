'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, XCircle, Archive, TrendingDown, CalendarClock, RotateCcw, User } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
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
  /** Payment health signal — computed from proposal data. */
  paymentStatus?: string | null;
  paymentStatusLabel?: string | null;
  paymentStatusColor?: string | null;
  /** Event archetype: wedding, corporate_gala, concert, etc. */
  event_archetype?: string | null;
  /** Lead source label (resolved from workspace lead sources). */
  lead_source?: string | null;
  /** Display name of the deal owner (resolved from owner_entity_id). */
  owner_name?: string | null;
  /** ISO timestamp of deal/event creation. */
  created_at?: string | null;
  /** Follow-up engine signals */
  followUpReason?: string | null;
  followUpPriority?: number | null;
  followUpStatus?: 'pending' | 'snoozed' | 'acted' | 'dismissed' | null;
};

const STATUS_LABELS: Record<string, string> = {
  inquiry: 'Inquiry',
  proposal: 'Proposal',
  contract_sent: 'Contract sent',
  contract_signed: 'Signed',
  deposit_received: 'Deposit received',
  won: 'Won',
  lost: 'Lost',
};

function formatEventDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const modeBorderColor: Record<NonNullable<StreamCardItem['mode']>, string> = {
  sales: 'var(--color-unusonic-warning)',
  ops: 'var(--color-unusonic-info)',
  finance: 'var(--color-unusonic-error)',
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
  const needsAttention = item.followUpStatus === 'pending' && !!item.followUpReason;
  const borderColor = modeBorderColor[mode];

  // Hover state for showing action buttons
  const [hovered, setHovered] = useState(false);

  // Two-step confirm state: null | 'cancel' | 'archive' | 'lost'
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'archive' | 'lost' | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Reschedule inline input state
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(item.event_date ?? '');
  const rescheduleInputRef = useRef<HTMLInputElement>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
    if (confirmAction !== 'cancel') { startConfirmTimer('cancel'); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPending(true);
    const result = await cancelEvent(item.id);
    setIsPending(false);
    setConfirmAction(null);
    if (!result.success) toast.error(result.error ?? 'Failed to cancel event');
  };

  const handleArchive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmAction !== 'archive') { startConfirmTimer('archive'); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPending(true);
    const result = await archiveDeal(item.id);
    setIsPending(false);
    setConfirmAction(null);
    if (!result.success) toast.error(result.error ?? 'Failed to archive deal');
  };

  const handleMarkLost = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmAction !== 'lost') { startConfirmTimer('lost'); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsPending(true);
    const result = await updateDealStatus(item.id, 'lost');
    setIsPending(false);
    setConfirmAction(null);
    if (!result.success) toast.error(result.error ?? 'Failed to mark deal as lost');
  };

  const handleReopen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPending(true);
    const result = await reopenDeal(item.id);
    setIsPending(false);
    if (!result.success) toast.error(result.error ?? 'Failed to reopen deal');
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
    if (result.success) setRescheduleOpen(false);
    else toast.error(result.error ?? 'Failed to reschedule event');
  };

  const handleRescheduleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleRescheduleConfirm(); }
    else if (e.key === 'Escape') { setRescheduleOpen(false); setRescheduleDate(item.event_date ?? ''); }
  };

  const isEvent = item.source === 'event';
  const isDeal = item.source === 'deal';
  const isLost = item.status === 'lost';
  const showDealArchiveButtons =
    isDeal && ['inquiry', 'proposal', 'contract_sent', 'contract_signed', 'deposit_received'].includes(item.status ?? '');
  const showDealLostButton = showDealArchiveButtons;
  const showReopenButton = isDeal && isLost;
  const showActions = hovered || selected || !!confirmAction || rescheduleOpen;

  const statusLabel = item.status ? (STATUS_LABELS[item.status] ?? item.status.replace(/_/g, ' ')) : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className={cn(className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!confirmAction) setConfirmAction(null); }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        className={cn(
          'w-full text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]',
          'transition-[box-shadow] duration-75',
          selected && 'ring-1 ring-[var(--stage-accent)]/60 ring-offset-1 ring-offset-[var(--stage-void)]',
        )}
        style={{ borderRadius: 'var(--stage-radius-panel, 12px)' }}
      >
        <div
          className={cn(
            'relative px-4 py-3 transition-colors duration-100',
            'bg-[var(--stage-surface-elevated)] hover:bg-[var(--stage-surface-raised)]',
            item.lifecycle_status === 'cancelled' && 'opacity-50',
          )}
          style={{
            borderRadius: 'var(--stage-radius-panel, 12px)',
            borderLeft: `3px solid ${borderColor}`,
          }}
        >
          {/* Row 1: Title + Status */}
          <div className="flex items-baseline justify-between gap-3 min-w-0">
            <h3 className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate leading-none">
              {item.title ?? 'Untitled'}
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {needsAttention && (
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--stage-text-primary)' }}
                />
              )}
              {item.lifecycle_status === 'cancelled' && (
                <span className="text-[10px] uppercase tracking-widest text-[var(--stage-text-tertiary)] font-medium">
                  cancelled
                </span>
              )}
              {!item.lifecycle_status?.includes('cancelled') && statusLabel && (
                <span className="text-[10px] uppercase tracking-widest text-[var(--stage-text-tertiary)] font-medium">
                  {statusLabel}
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Client + Meta */}
          <div className="flex items-center gap-3 mt-2 text-[12px] text-[var(--stage-text-secondary)] leading-none">
            {item.client_name && (
              <span className="flex items-center gap-1 truncate min-w-0">
                <User size={11} className="shrink-0 opacity-45" aria-hidden />
                <span className="truncate">{item.client_name}</span>
              </span>
            )}
            {item.event_date && (
              <span className="flex items-center gap-1 shrink-0">
                <Clock size={11} className="shrink-0 opacity-45" aria-hidden />
                {formatEventDate(item.event_date)}
              </span>
            )}
            {item.location && (
              <span className="flex items-center gap-1 truncate min-w-0">
                <MapPin size={11} className="shrink-0 opacity-45" aria-hidden />
                <span className="truncate">{item.location.split(',')[0]}</span>
              </span>
            )}
            {/* Payment status pill — visible on hover/selected only */}
            {item.paymentStatusLabel && item.paymentStatusColor && (hovered || selected) && (
              <span
                className="ml-auto shrink-0 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-px leading-tight transition-opacity"
                style={{
                  color: item.paymentStatusColor,
                  backgroundColor: `color-mix(in oklch, ${item.paymentStatusColor} 10%, transparent)`,
                  borderRadius: 'var(--stage-radius-input, 6px)',
                }}
              >
                {item.paymentStatusLabel}
              </span>
            )}
          </div>


          {/* Action buttons — shown on hover/selected */}
          <AnimatePresence>
            {showActions && (showDealArchiveButtons || showDealLostButton || showReopenButton || isEvent) && (
              <motion.div
                key="actions"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={STAGE_LIGHT}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-1.5 mt-2 pt-2" style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}>
                  {/* Deal: Reopen */}
                  {showReopenButton && (
                    <ActionBtn
                      icon={<RotateCcw size={11} />}
                      label="Reopen deal"
                      onClick={handleReopen}
                      disabled={isPending}
                    />
                  )}

                  {/* Deal: Archive */}
                  {showDealArchiveButtons && (
                    <ActionBtn
                      icon={<Archive size={11} />}
                      label={confirmAction === 'archive' ? 'Confirm?' : 'Archive deal'}
                      onClick={handleArchive}
                      disabled={isPending}
                      active={confirmAction === 'archive'}
                      variant="warning"
                    />
                  )}

                  {/* Deal: Mark lost */}
                  {showDealLostButton && (
                    <ActionBtn
                      icon={<TrendingDown size={11} />}
                      label={confirmAction === 'lost' ? 'Confirm?' : 'Mark lost'}
                      onClick={handleMarkLost}
                      disabled={isPending}
                      active={confirmAction === 'lost'}
                      variant="error"
                    />
                  )}

                  {/* Event: Reschedule */}
                  {isEvent && item.lifecycle_status !== 'cancelled' && (
                    <ActionBtn
                      icon={<CalendarClock size={11} />}
                      label="Reschedule show"
                      onClick={handleRescheduleToggle}
                      disabled={isPending}
                      active={rescheduleOpen}
                      variant="info"
                    />
                  )}

                  {/* Event: Cancel */}
                  {isEvent && item.lifecycle_status !== 'cancelled' && (
                    <ActionBtn
                      icon={<XCircle size={11} />}
                      label={confirmAction === 'cancel' ? 'Confirm?' : 'Cancel show'}
                      onClick={handleCancel}
                      disabled={isPending}
                      active={confirmAction === 'cancel'}
                      variant="warning"
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Reschedule inline date input */}
          <AnimatePresence>
            {rescheduleOpen && (
              <motion.div
                key="reschedule-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={STAGE_MEDIUM}
                className="overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}>
                  <input
                    ref={rescheduleInputRef}
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    onKeyDown={handleRescheduleKeyDown}
                    disabled={isPending}
                    className="stage-input flex-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRescheduleConfirm(); }}
                    disabled={isPending || !rescheduleDate}
                    className="flex items-center justify-center size-6 text-[var(--color-unusonic-info)] bg-[oklch(0.55_0.15_250_/_0.10)] text-xs font-medium transition-colors hover:bg-[oklch(0.55_0.15_250_/_0.20)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setRescheduleOpen(false); setRescheduleDate(item.event_date ?? ''); }}
                    className="flex items-center justify-center size-6 text-[var(--stage-text-tertiary)] bg-[var(--stage-surface)] text-xs font-medium transition-colors hover:text-[var(--stage-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Compact action button used inside the card
function ActionBtn({
  icon,
  label,
  onClick,
  disabled,
  active,
  variant,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  active?: boolean;
  variant?: 'warning' | 'error' | 'info';
}) {
  const colorVar =
    variant === 'warning' ? 'var(--color-unusonic-warning)'
    : variant === 'error' ? 'var(--color-unusonic-error)'
    : variant === 'info' ? 'var(--color-unusonic-info)'
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-40',
        active && colorVar
          ? 'border'
          : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
      )}
      style={{
        borderRadius: 'var(--stage-radius-input, 6px)',
        ...(active && colorVar
          ? {
              color: colorVar,
              backgroundColor: `color-mix(in oklch, ${colorVar} 12%, transparent)`,
              borderColor: `color-mix(in oklch, ${colorVar} 25%, transparent)`,
            }
          : {}),
      }}
    >
      {icon}
      {label}
    </button>
  );
}

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, MapPin, XCircle, Archive, TrendingDown, CalendarClock, RotateCcw, User } from 'lucide-react';
import { toast } from 'sonner';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { ReadinessRibbon } from './readiness-ribbon';
import { cn } from '@/shared/lib/utils';
import type { ReadinessData } from '../lib/compute-readiness';
import { cancelEvent } from '../actions/delete-event';
import { archiveDeal } from '../actions/archive-deal';
import { reopenDeal } from '../actions/reopen-deal';
import { rescheduleEvent } from '../actions/reschedule-event';
import { updateDealStatus } from '../actions/update-deal-status';
import { readEventStatusFromLifecycle } from '@/shared/lib/event-status/read-event-status';

export type StreamCardItem = {
  id: string;
  title: string | null;
  status: string | null;
  event_date: string | null;
  location: string | null;
  client_name: string | null;
  source: 'deal' | 'event';
  lifecycle_status?: string | null;
  /** Pass 3 Phase 4: set when the event has been wrapped. Used by stream.tsx filters. */
  archived_at?: string | null;
  /** Phase 3h: the deal's current pipeline stage id. Used by tag-based Stream tab filters. Events have no stage_id. */
  stage_id?: string | null;
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
  /** Show health status from PM. */
  show_health_status?: 'on_track' | 'at_risk' | 'blocked' | null;
  /** Follow-up engine signals */
  followUpReason?: string | null;
  followUpPriority?: number | null;
  followUpStatus?: 'pending' | 'snoozed' | 'acted' | 'dismissed' | null;
  followUpCategory?: 'sales' | 'ops' | 'nurture' | null;
  followUpReasonType?: string | null;
  /** Production readiness signals — present for won deals with events. */
  readiness?: ReadinessData | null;
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
  // Pass 3 Phase 2 — route lifecycle_status reads through the canonical helper
  // so every display check ("is cancelled", "show actions") goes through one
  // place. Phase 0's DB invariant guarantees this maps losslessly from the
  // lifecycle_status column alone for event-sourced CRMQueueItems.
  const itemPhase = item.source === 'event' ? readEventStatusFromLifecycle(item.lifecycle_status ?? null) : null;

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
    if (!result.success) toast.error(result.error ?? 'Failed to cancel show');
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
    else toast.error(result.error ?? 'Failed to reschedule show');
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
          'w-full text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          'transition-[box-shadow] duration-75',
          selected && 'ring-1 ring-[var(--stage-accent)]/60 ring-offset-1 ring-offset-[var(--stage-void)]',
        )}
        style={{ borderRadius: 'var(--stage-radius-panel, 12px)' }}
      >
        <div
          className={cn(
            'relative px-4 py-3 transition-colors duration-100',
            'bg-[var(--stage-surface-elevated)] hover:bg-[oklch(1_0_0_/_0.08)]',
            itemPhase === 'cancelled' && 'opacity-[0.45]',
          )}
          style={{
            borderRadius: 'var(--stage-radius-panel, 12px)',
            borderLeft: `3px solid ${borderColor}`,
          }}
        >
          {/* Row 1: Title + Status */}
          <div className="flex items-baseline justify-between gap-3 min-w-0">
            <h3 className="stage-readout truncate leading-none flex items-center gap-1.5">
              {item.show_health_status && (
                <span
                  className="size-2 rounded-full shrink-0 inline-block"
                  style={{
                    backgroundColor:
                      item.show_health_status === 'on_track'
                        ? 'var(--color-unusonic-success)'
                        : item.show_health_status === 'at_risk'
                          ? 'var(--color-unusonic-warning)'
                          : 'var(--color-unusonic-error)',
                  }}
                />
              )}
              <span className="truncate">{item.title ?? 'Untitled'}</span>
            </h3>
            <div className="flex items-center gap-2 shrink-0">
              {needsAttention && (
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: 'var(--stage-text-primary)' }}
                />
              )}
              {itemPhase === 'cancelled' && (
                <span className="stage-label text-[var(--stage-text-tertiary)]">
                  cancelled
                </span>
              )}
              {itemPhase !== 'cancelled' && statusLabel && (
                <span className="stage-label text-[var(--stage-text-tertiary)]">
                  {statusLabel}
                </span>
              )}
            </div>
          </div>

          {/* Row 2: Client + Meta */}
          <div className="flex items-center gap-3 mt-2 stage-badge-text text-[var(--stage-text-secondary)] leading-none">
            {item.client_name && (
              <span className="flex items-center gap-1 truncate min-w-0">
                <User size={11} className="shrink-0 text-[var(--stage-text-tertiary)]" aria-hidden />
                <span className="truncate">{item.client_name}</span>
              </span>
            )}
            {item.event_date && (
              <span className="flex items-center gap-1 shrink-0">
                <Clock size={11} className="shrink-0 text-[var(--stage-text-tertiary)]" aria-hidden />
                {formatEventDate(item.event_date)}
              </span>
            )}
            {item.location && (
              <span className="flex items-center gap-1 truncate min-w-0">
                <MapPin size={11} className="shrink-0 text-[var(--stage-text-tertiary)]" aria-hidden />
                <span className="truncate">{item.location.split(',')[0]}</span>
              </span>
            )}
            {/* Payment status pill — visible on hover/selected only */}
            {item.paymentStatusLabel && item.paymentStatusColor && (hovered || selected) && (
              <span
                className="ml-auto shrink-0 stage-micro px-1.5 py-px leading-tight transition-opacity"
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

          {/* Readiness mini ribbon — won deals with event data */}
          {item.readiness && (
            <div className="mt-2">
              <ReadinessRibbon readiness={item.readiness} mini />
            </div>
          )}

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
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}>
                  <AnimatePresence mode="wait">
                    {confirmAction ? (
                      /* ── Confirmation strip ── */
                      <motion.div
                        key={`confirm-${confirmAction}`}
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -2 }}
                        transition={STAGE_LIGHT}
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="stage-badge-text text-[var(--stage-text-secondary)] flex-1 truncate">
                          {confirmAction === 'archive' && 'Archive this deal?'}
                          {confirmAction === 'lost' && 'Mark this deal as lost?'}
                          {confirmAction === 'cancel' && 'Cancel this show?'}
                        </span>
                        <button
                          type="button"
                          onClick={
                            confirmAction === 'archive' ? handleArchive
                            : confirmAction === 'lost' ? handleMarkLost
                            : handleCancel
                          }
                          disabled={isPending}
                          className="flex items-center gap-1 px-2 py-0.5 stage-badge-text font-medium rounded-md transition-colors disabled:opacity-45"
                          style={{
                            color: confirmAction === 'lost' ? 'var(--color-unusonic-error)' : 'var(--color-unusonic-warning)',
                            backgroundColor: confirmAction === 'lost'
                              ? 'color-mix(in oklch, var(--color-unusonic-error) 12%, transparent)'
                              : 'color-mix(in oklch, var(--color-unusonic-warning) 12%, transparent)',
                          }}
                        >
                          {confirmAction === 'archive' && <><Archive size={10} /> Archive</>}
                          {confirmAction === 'lost' && <><TrendingDown size={10} /> Mark lost</>}
                          {confirmAction === 'cancel' && <><XCircle size={10} /> Cancel show</>}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmAction(null); if (timerRef.current) clearTimeout(timerRef.current); }}
                          className="px-1.5 py-0.5 stage-badge-text text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
                        >
                          Dismiss
                        </button>
                      </motion.div>
                    ) : (
                      /* ── Action buttons (default) ── */
                      <motion.div
                        key="actions-default"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={STAGE_LIGHT}
                        className="flex items-center gap-1.5"
                      >
                        {showReopenButton && (
                          <ActionBtn icon={<RotateCcw size={11} />} label="Reopen deal" onClick={handleReopen} disabled={isPending} />
                        )}
                        {showDealArchiveButtons && (
                          <ActionBtn icon={<Archive size={11} />} label="Archive" onClick={handleArchive} disabled={isPending} variant="warning" />
                        )}
                        {showDealLostButton && (
                          <ActionBtn icon={<TrendingDown size={11} />} label="Lost" onClick={handleMarkLost} disabled={isPending} variant="error" />
                        )}
                        {isEvent && itemPhase !== 'cancelled' && (
                          <ActionBtn icon={<CalendarClock size={11} />} label="Reschedule" onClick={handleRescheduleToggle} disabled={isPending} active={rescheduleOpen} variant="info" />
                        )}
                        {isEvent && itemPhase !== 'cancelled' && (
                          <ActionBtn icon={<XCircle size={11} />} label="Cancel" onClick={handleCancel} disabled={isPending} variant="warning" />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                    className="flex items-center justify-center size-6 text-[var(--color-unusonic-info)] bg-[oklch(0.75_0.15_240_/_0.10)] stage-badge-text font-medium transition-colors hover:bg-[oklch(0.75_0.15_240_/_0.20)] disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setRescheduleOpen(false); setRescheduleDate(item.event_date ?? ''); }}
                    className="flex items-center justify-center size-6 text-[var(--stage-text-tertiary)] bg-[var(--stage-surface)] stage-badge-text font-medium transition-colors hover:text-[var(--stage-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
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
        'flex items-center gap-1 px-1.5 py-0.5 stage-badge-text font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45',
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

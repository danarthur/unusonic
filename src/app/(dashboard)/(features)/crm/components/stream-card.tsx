'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  MapPin,
  XCircle,
  Archive,
  TrendingDown,
  CalendarClock,
  RotateCcw,
  User,
  MoreHorizontal,
  AlertCircle,
} from 'lucide-react';
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
import type { WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';
import { AionSuggestionRow } from './aion-suggestion-row';
import { PillUnseenDot } from '@/app/(dashboard)/(features)/aion/components/PillUnseenDot';

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
  /** Derived mode tag — no longer renders as a border color (Fork α, 2026-04-19). Kept on the type for legacy consumers. */
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
  /** Series metadata — present on deal cards whose project has is_series = true. */
  is_series?: boolean;
  /** Active (non-archived) show count. For singletons this is 1 or undefined. */
  series_show_count?: number;
  /** ISO date (yyyy-MM-dd) of the first upcoming show, falling back to the last show. */
  series_next_upcoming?: string | null;
  /** ISO date of the last show in the series. */
  series_last_date?: string | null;
  /** Series archetype label (residency, tour, …) when set. */
  series_archetype?: string | null;
};

// Follow-up reason types that warrant the warning-yellow attention tint.
// Routine nudges (proposal_sent reminders, generic check-ins, thank-yous) stay
// in the neutral secondary color so yellow keeps its meaning as "something is
// actually wrong" rather than "a follow-up exists."
const WARNING_REASON_TYPES = new Set([
  'stall',
  'gone_quiet',
  'proposal_bounced',
  'proposal_unseen',
  'date_hold_pressure',
  'no_owner',
  'deadline_proximity',
]);

// Fallback when a deal's stage_id can't be resolved against the workspace's
// current pipelineStages (legacy rows, seed data, missing relation).
const KIND_LABELS: Record<string, string> = {
  working: 'In progress',
  won: 'Won',
  lost: 'Lost',
  // Legacy slugs preserved for pre-collapse rows:
  inquiry: 'Inquiry',
  proposal: 'Proposal',
  contract_sent: 'Contract sent',
  contract_signed: 'Signed',
  deposit_received: 'Deposit received',
};

function formatEventDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function resolveStageLabel(
  item: StreamCardItem,
  pipelineStages: readonly WorkspacePipelineStage[] | undefined,
): string | null {
  if (item.stage_id && pipelineStages) {
    const match = pipelineStages.find((s) => s.id === item.stage_id);
    if (match) return match.label;
  }
  if (!item.status) return null;
  return KIND_LABELS[item.status] ?? item.status.replace(/_/g, ' ');
}

export function StreamCard({
  item,
  selected,
  onClick,
  onHover,
  pipelineStages,
  hasUnseenPill = false,
  stageSuggestion = null,
  className,
}: {
  item: StreamCardItem;
  selected: boolean;
  onClick: () => void;
  /**
   * Optional hover callback used to prefetch the detail bundle. Fires after
   * a 150ms debounce so a user scanning the list quickly doesn't trigger a
   * prefetch on every card the cursor crosses. Cancelled on mouse leave.
   * Hover-capable pointers only.
   */
  onHover?: () => void;
  /** Workspace pipeline stages — used to resolve `item.stage_id` into the
   *  human-readable label the workspace configured. Falls back to KIND_LABELS
   *  when a stage can't be found. */
  pipelineStages?: readonly WorkspacePipelineStage[];
  /** Wk 10 D7 — true when this deal has ≥1 unseen Aion proactive line.
   *  Resolved by the parent stream from a single bulk-fetch query so the
   *  badge doesn't N+1 a per-card read. Always false for event rows. */
  hasUnseenPill?: boolean;
  /** Pre-resolved stage suggestion for this deal — bulk-fetched by the parent
   *  stream so AionSuggestionRow doesn't N+1 its own per-card server action. */
  stageSuggestion?: import('../actions/aion-suggestion-actions').StageSuggestion | null;
  className?: string;
}) {
  // Pass 3 Phase 2 — route lifecycle_status reads through the canonical helper
  // so every display check ("is cancelled", "show actions") goes through one
  // place. Phase 0's DB invariant guarantees this maps losslessly from the
  // lifecycle_status column alone for event-sourced CRMQueueItems.
  const itemPhase = item.source === 'event' ? readEventStatusFromLifecycle(item.lifecycle_status ?? null) : null;

  // Two-step confirm state: null | 'cancel' | 'archive' | 'lost'
  const [confirmAction, setConfirmAction] = useState<'cancel' | 'archive' | 'lost' | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Kebab menu open state
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Hover prefetch debounce — set on mouseenter, cleared on mouseleave so a
  // user scanning the list quickly doesn't fire a prefetch on every card.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  }, []);

  // Tracks whether the Aion stage-suggestion row is rendering its own call-
  // to-action. When true, the follow-up reason line above it is suppressed —
  // Aion's concrete "Advance to X" is a strict upgrade over a generic
  // "Nudge the client" when both happen to fire.
  const [aionSuggestionVisible, setAionSuggestionVisible] = useState(false);

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

  // Click-outside + escape for kebab menu
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [menuOpen]);

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
  // Phase 3i: kind-based status checks. Post-collapse, `status` holds kind
  // ('working' | 'won' | 'lost'); the legacy slugs still pass during the
  // rollout window so we include them in the working-stage set.
  const WORKING_STATUSES = new Set([
    'working',
    'inquiry', 'proposal', 'contract_sent', 'contract_signed', 'deposit_received',
  ]);
  const isLost = item.status === 'lost';
  const canArchive = isDeal && WORKING_STATUSES.has(item.status ?? '');
  const canMarkLost = canArchive;
  const canReopen = isDeal && isLost;
  const canReschedule = isEvent && itemPhase !== 'cancelled';
  const canCancel = isEvent && itemPhase !== 'cancelled';
  const hasAnyAction = canArchive || canMarkLost || canReopen || canReschedule || canCancel;

  const stageLabel = resolveStageLabel(item, pipelineStages);
  // Follow-up attention line: only surface on active working deals. Won/lost
  // deals are out of the sales flow — any pending queue row left on them is
  // stale (see cron cleanup sweep in follow-up-queue/route.ts for the root fix).
  const showAttentionLine =
    item.followUpStatus === 'pending' &&
    !!item.followUpReason &&
    !aionSuggestionVisible &&
    item.status !== 'won' &&
    item.status !== 'lost';

  return (
    <motion.div
      layout
      transition={STAGE_MEDIUM}
      className={cn(className)}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
        onMouseEnter={() => {
          if (!onHover) return;
          if (typeof window !== 'undefined' && !window.matchMedia('(hover: hover)').matches) return;
          if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
          hoverTimerRef.current = setTimeout(() => onHover(), 150);
        }}
        onMouseLeave={() => {
          if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
        }}
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
          style={{ borderRadius: 'var(--stage-radius-panel, 12px)' }}
        >
          {/* Row 1: Title + (stage chip) + kebab */}
          <div className="flex items-baseline justify-between gap-2 min-w-0">
            <h3 className="stage-readout truncate leading-none flex items-center gap-1.5 min-w-0 flex-1">
              {/* Wk 10 D7 — leading-edge unseen-pill dot. Achromatic accent;
                  distinct from the chromatic show_health_status dot below.
                  Boolean per Stage Engineering convention — no count number. */}
              <PillUnseenDot
                show={hasUnseenPill}
                ariaLabel="Unseen Aion pill on this deal"
                size={7}
              />
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
            <div className="flex items-center gap-1.5 shrink-0">
              {itemPhase === 'cancelled' ? (
                <span className="stage-label text-[var(--stage-text-tertiary)]">
                  cancelled
                </span>
              ) : stageLabel ? (
                <span className="stage-label text-[var(--stage-text-tertiary)]">
                  {stageLabel}
                </span>
              ) : null}
              {hasAnyAction && (
                <div className="relative" ref={menuRef}>
                  <button
                    type="button"
                    aria-label="More actions"
                    aria-expanded={menuOpen}
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen((v) => !v);
                    }}
                    className={cn(
                      'inline-flex items-center justify-center size-6 rounded-sm',
                      'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
                      'hover:bg-[oklch(1_0_0_/_0.06)] transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                    )}
                  >
                    <MoreHorizontal size={14} aria-hidden />
                  </button>
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div
                        role="menu"
                        initial={{ opacity: 0, y: -2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -2 }}
                        transition={STAGE_LIGHT}
                        className={cn(
                          'absolute right-0 top-full mt-1 z-20 min-w-40 rounded-md p-1',
                          'bg-[var(--stage-surface-raised)] border border-[var(--stage-edge-subtle)]',
                          'shadow-lg',
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {canReopen && (
                          <MenuItem
                            icon={<RotateCcw size={12} />}
                            label="Reopen deal"
                            onClick={(e) => { setMenuOpen(false); handleReopen(e); }}
                            disabled={isPending}
                          />
                        )}
                        {canReschedule && (
                          <MenuItem
                            icon={<CalendarClock size={12} />}
                            label="Reschedule"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpen(false);
                              handleRescheduleToggle(e);
                            }}
                            disabled={isPending}
                          />
                        )}
                        {canArchive && (
                          <MenuItem
                            icon={<Archive size={12} />}
                            label="Archive"
                            onClick={(e) => { setMenuOpen(false); handleArchive(e); }}
                            disabled={isPending}
                            tone="warning"
                          />
                        )}
                        {canMarkLost && (
                          <MenuItem
                            icon={<TrendingDown size={12} />}
                            label="Mark lost"
                            onClick={(e) => { setMenuOpen(false); handleMarkLost(e); }}
                            disabled={isPending}
                            tone="error"
                          />
                        )}
                        {canCancel && (
                          <MenuItem
                            icon={<XCircle size={12} />}
                            label="Cancel show"
                            onClick={(e) => { setMenuOpen(false); handleCancel(e); }}
                            disabled={isPending}
                            tone="warning"
                          />
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
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
            {item.is_series ? (
              <span className="flex items-center gap-1 shrink-0" title={item.series_archetype ?? 'Series'}>
                <Clock size={11} className="shrink-0 text-[var(--stage-text-tertiary)]" aria-hidden />
                {item.series_show_count ?? 0} show{item.series_show_count === 1 ? '' : 's'}
                {item.series_next_upcoming ? ` · next ${formatEventDate(item.series_next_upcoming)}` : ''}
              </span>
            ) : item.event_date && (
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
            {/* Payment status pill — visible on selected card only. Promoted from
                hover to selection so the signal reads at scan without pinning
                money data to every card in view. */}
            {item.paymentStatusLabel && item.paymentStatusColor && selected && (
              <span
                className="ml-auto shrink-0 stage-micro px-1.5 py-px leading-tight"
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

          {/* Follow-up reason — replaces the 1.5px attention dot with the
              actual reason text so the user can scan what's wrong without
              opening the card. Warning-yellow tint is reserved for reason
              types that represent real trouble (stall, bounced, gone quiet,
              conflict, unowned, deadline, unseen); routine nudges render in
              the neutral secondary color so yellow keeps its signal value. */}
          {showAttentionLine && (
            <div
              className="mt-2 flex items-start gap-1.5 stage-badge-text leading-snug"
              style={{
                color: WARNING_REASON_TYPES.has(item.followUpReasonType ?? '')
                  ? 'var(--color-unusonic-warning)'
                  : 'var(--stage-text-secondary)',
              }}
            >
              <AlertCircle size={11} className="shrink-0 mt-px" aria-hidden />
              <span className="truncate">{item.followUpReason}</span>
            </div>
          )}

          {/* Readiness mini ribbon — won deals with event data */}
          {item.readiness && (
            <div className="mt-2">
              <ReadinessRibbon readiness={item.readiness} mini />
            </div>
          )}

          {/* Confirmation strip — shown after a destructive action is triggered
              from the kebab menu. Two-step confirm with auto-timeout. */}
          <AnimatePresence>
            {confirmAction && (
              <motion.div
                key={`confirm-${confirmAction}`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={STAGE_LIGHT}
                className="overflow-hidden"
              >
                <div
                  className="mt-2 pt-2 flex items-center gap-2"
                  style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
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

          {/* Aion stage-move suggestion — only renders on the selected card
              so the pipeline view doesn't N+1-fetch insights across every
              tile. The component self-fetches on mount and returns null
              when there's nothing to surface. */}
          {selected && item.source === 'deal' && (
            <div onClick={(e) => e.stopPropagation()}>
              <AionSuggestionRow
                dealId={item.id}
                onVisibilityChange={setAionSuggestionVisible}
              />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Kebab-menu item — single visual grammar for all actions.
function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  tone?: 'warning' | 'error';
}) {
  const colorVar =
    tone === 'warning' ? 'var(--color-unusonic-warning)'
    : tone === 'error' ? 'var(--color-unusonic-error)'
    : undefined;

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left stage-badge-text',
        'transition-colors disabled:opacity-45',
        'hover:bg-[var(--stage-surface)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
      )}
      style={colorVar ? { color: colorVar } : { color: 'var(--stage-text-secondary)' }}
    >
      <span className="shrink-0 flex items-center">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

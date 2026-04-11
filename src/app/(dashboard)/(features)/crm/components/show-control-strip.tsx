'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Square, Clock, FileCheck } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { markShowStarted, markShowEnded, undoMarkShowStarted } from '../actions/mark-show-state';
import { toast } from 'sonner';

/**
 * ShowControlStrip — the T-0 lifecycle transition surface on the Plan lens.
 *
 * Design derived from the 2026-04-11 research-team pass (User Advocate +
 * Field Expert + Signal Navigator):
 *
 *   1. Strip form factor parallel to HandoffConfirmStrip — a phase-transition
 *      shelf in the left-column action stack, below DaySheetActionStrip.
 *
 *   2. Date-gated visibility: only renders within a window around starts_at,
 *      so the strip doesn't crowd the Plan lens on days when the show is
 *      still weeks away. Before T-24h → hidden. T-24h through 'completed'
 *      state → visible. (Research recommends 24h; easy to tune.)
 *
 *   3. Four visible states matching the PM's mental model ("Prep → Live →
 *      Wrapping"):
 *        Ready     — within window, not yet started (Start Show CTA)
 *        Live      — in_progress (tally-light red, End Show CTA, undo hint)
 *        Wrapping  — completed (Open wrap report CTA, editable timestamps)
 *        (Cancelled and pre-window states render nothing.)
 *
 *   4. Single-click Start with 10-second undo toast (sonner action).
 *      Single confirmation prompt on End (browser confirm — no type-to-confirm,
 *      per Field Expert: the industry universally treats that as friction on a
 *      time-critical action).
 *
 *   5. "LIVE" vocabulary borrows from broadcast tally-light conventions —
 *      industry-standard for "this is on air right now".
 *
 *   6. Load-bearing side effects of Start/End Show (client portal song lock,
 *      wrap report unlock) live in mark-show-state.ts actions, not here.
 *      This component is purely the transition trigger + state display.
 */

export type ShowControlStripProps = {
  eventId: string;
  status: string | null;
  startsAt: string | null;
  endsAt: string | null;
  showStartedAt: string | null;
  showEndedAt: string | null;
  /** Pass 3 Phase 4: when set, the event has been wrapped and the strip hides. */
  archivedAt: string | null;
  /** Called after any successful transition so the parent can refetch event data. */
  onStateChanged?: () => void;
};

const WITHIN_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours before starts_at

function formatClock(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatClockWithDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + ' at ' + d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function ShowControlStrip({
  eventId,
  status,
  startsAt,
  endsAt,
  showStartedAt,
  showEndedAt,
  archivedAt,
  onStateChanged,
}: ShowControlStripProps) {
  const [isPending, startTransition] = useTransition();
  const [localStatus, setLocalStatus] = useState<string | null>(status);
  const [localStartedAt, setLocalStartedAt] = useState<string | null>(showStartedAt);
  const [localEndedAt, setLocalEndedAt] = useState<string | null>(showEndedAt);

  // ── Visibility gating ─────────────────────────────────────────────────────
  // Render nothing when:
  //  - status is 'cancelled' (cancel surface is elsewhere)
  //  - status is 'archived' OR archived_at is set (Pass 3 Phase 4 — wrap
  //    flow has taken over, strip is done)
  //  - status is still 'planned' AND starts_at is more than 24h away
  //  - starts_at is missing entirely (no schedule context)
  if (localStatus === 'cancelled') return null;
  if (localStatus === 'archived' || archivedAt) return null;
  if (!startsAt) return null;

  const startsAtMs = Date.parse(startsAt);
  const nowMs = Date.now();
  const withinWindow = nowMs >= startsAtMs - WITHIN_WINDOW_MS;
  const isLive = localStatus === 'in_progress';
  const isComplete = localStatus === 'completed';

  if (localStatus === 'planned' && !withinWindow) return null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = () => {
    startTransition(async () => {
      const result = await markShowStarted(eventId);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to start show');
        return;
      }
      setLocalStatus('in_progress');
      setLocalStartedAt('startedAt' in result ? result.startedAt : new Date().toISOString());
      onStateChanged?.();

      // 10-second undo affordance — long enough for fat-finger rescue,
      // short enough that the client portal lock isn't misleading.
      toast.success('Show started', {
        description: 'Client portal is now locked.',
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: async () => {
            const undo = await undoMarkShowStarted(eventId);
            if (undo.success) {
              setLocalStatus('planned');
              setLocalStartedAt(null);
              onStateChanged?.();
              toast.success('Reverted');
            } else {
              toast.error(undo.error ?? 'Could not undo');
            }
          },
        },
      });
    });
  };

  const handleEnd = () => {
    // Single confirm, no type-to-confirm. PMs don't have time for bureaucratic
    // theatre mid-show or during load-out. Keep the prompt short and factual.
    const confirmed = window.confirm(
      'End show? Client portal will lock and the wrap report will open.',
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await markShowEnded(eventId);
      if (!result.success) {
        toast.error(result.error ?? 'Failed to end show');
        return;
      }
      setLocalStatus('completed');
      setLocalEndedAt('endedAt' in result ? result.endedAt : new Date().toISOString());
      onStateChanged?.();
      toast.success('Show ended', {
        description: 'Wrap report is now available.',
      });
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  // State 3 — completed / wrapping
  if (isComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={STAGE_LIGHT}
      >
        <StagePanel
          elevated
          className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="stage-label mb-1">Show ended</p>
              <p className="text-sm text-[var(--stage-text-secondary)] truncate tracking-tight">
                {localEndedAt
                  ? `Ended ${formatClockWithDate(localEndedAt)}`
                  : 'Ended'}
              </p>
            </div>
            <a
              href="#wrap-report"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors stage-hover overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              <FileCheck size={12} strokeWidth={1.5} aria-hidden />
              Open wrap report
            </a>
          </div>
        </StagePanel>
      </motion.div>
    );
  }

  // State 2 — live / in_progress
  if (isLive) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={STAGE_LIGHT}
      >
        <StagePanel
          elevated
          className="p-5 rounded-[var(--stage-radius-panel)] border border-[color-mix(in_oklch,var(--color-unusonic-error)_30%,transparent)]"
          style={{
            background:
              'color-mix(in oklch, var(--color-unusonic-error) 6%, var(--stage-surface-raised))',
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 flex items-center gap-3">
              {/* Tally-light pill — borrowed from broadcast red-on-air convention */}
              <motion.span
                aria-label="Show is live"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium tracking-wider uppercase"
                style={{
                  background: 'var(--color-unusonic-error)',
                  color: 'oklch(0.99 0 0)',
                }}
                animate={{ opacity: [1, 0.7, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              >
                <span className="size-1.5 rounded-full bg-current shrink-0" />
                Live
              </motion.span>
              <p className="text-sm text-[var(--stage-text-secondary)] truncate tracking-tight">
                {localStartedAt
                  ? `Started ${formatClock(localStartedAt)}`
                  : 'Show is in progress'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleEnd}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors stage-hover overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
            >
              <Square size={12} strokeWidth={1.5} aria-hidden />
              {isPending ? 'Ending...' : 'End show'}
            </button>
          </div>
        </StagePanel>
      </motion.div>
    );
  }

  // State 1 — ready (planned, within window)
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={STAGE_MEDIUM}
    >
      <StagePanel
        elevated
        className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="stage-label mb-1">Show control</p>
            <p className="flex items-center gap-1.5 text-sm text-[var(--stage-text-secondary)] truncate tracking-tight">
              <Clock size={12} strokeWidth={1.5} className="shrink-0 opacity-60" aria-hidden />
              {`Ready when you are${startsAt ? ` · ${formatClock(startsAt)}` : ''}`}
            </p>
          </div>
          <AnimatePresence>
            <motion.button
              key="start"
              type="button"
              onClick={handleStart}
              disabled={isPending}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[22px] text-xs font-medium tracking-tight border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] transition-colors stage-hover overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
            >
              <Play size={12} strokeWidth={1.5} aria-hidden />
              {isPending ? 'Starting...' : 'Start show'}
            </motion.button>
          </AnimatePresence>
        </div>
      </StagePanel>
    </motion.div>
  );
}

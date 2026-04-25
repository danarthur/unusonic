'use client';

/**
 * Pill-history Sheet — Wk 10 D7.
 *
 * Right-side Sheet rendering the full timeline of Aion proactive lines for a
 * deal. Reverse-chronological with date-header groupings; dismissed pills
 * demoted with a "dismissed" label (older ones collapsed into a bottom
 * accordion); per-row useful/not-useful feedback chip; muted-reason strip
 * with Resurface action when the workspace has an active signal disable.
 *
 * Cessation school for D8: this Sheet IS the surface for "Aion paused this
 * signal type." There is no proactive notification — the strip exists here
 * and only here. The Resurface link drops the workspace_signal_disables row
 * AND the caller's per-user mutes for that signal_type.
 *
 * Cross-table discipline: this code path reads ONLY from
 *   cortex.aion_proactive_lines  (via list_aion_proactive_history)
 *   cortex.aion_workspace_signal_disables  (via getActiveSignalDisables)
 * It MUST NOT touch cortex.aion_insights — that's the lobby Daily Brief's
 * domain, with its own greeting-identity telemetry. Enforced by an
 * integration test in the C3 commit.
 *
 * Design: docs/reference/aion-pill-history-design.md
 * Plan:   docs/reference/aion-deal-chat-phase3-plan.md §3.7
 */

import * as React from 'react';
import { History } from 'lucide-react';
import { toast } from 'sonner';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/shared/ui/sheet';
import { cn } from '@/shared/lib/utils';
import {
  getPillHistoryForDeal,
  getActiveSignalDisablesForWorkspace,
  submitPillFeedback,
  resurfaceMutedReason,
  markPillSeen,
  type PillHistoryRow,
  type ActiveSignalDisable,
  type PillFeedback,
} from '../actions/pill-history-actions';
import { Timeline } from './PillHistoryTimeline';

const SIGNAL_LABEL: Record<string, string> = {
  money_event: 'Money',
  proposal_engagement: 'Engagement',
  dead_silence: 'Silence',
};

const RECENT_DISMISSAL_DAYS = 3;

interface PillHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dealId: string;
  workspaceId: string;
  /** Days back to load. Defaults to 14 per the design doc. */
  days?: number;
}

export function PillHistorySheet({
  open,
  onOpenChange,
  dealId,
  workspaceId,
  days = 14,
}: PillHistorySheetProps) {
  const [rows, setRows] = React.useState<PillHistoryRow[]>([]);
  const [disables, setDisables] = React.useState<ActiveSignalDisable[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [showOlderDismissed, setShowOlderDismissed] = React.useState(false);

  // Self-fetch on open. Lazy: this Sheet only mounts when its parent decides
  // to render it (typically wrapped in next/dynamic + ssr:false), and only
  // fetches once the user actually triggers it.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getPillHistoryForDeal(dealId, days),
      getActiveSignalDisablesForWorkspace(workspaceId),
    ]).then(([h, d]) => {
      if (cancelled) return;
      setRows(h.rows);
      setDisables(d.rows);
      setLoading(false);
      // D7 Q2 — opening the Sheet stamps seen on every visible (un-dismissed,
      // un-resolved, un-expired) row. Idempotent server-side; no-ops on rows
      // already stamped.
      const nowMs = Date.now();
      for (const row of h.rows) {
        if (row.dismissed_at) continue;
        if (row.resolved_at) continue;
        if (row.seen_at) continue;
        if (new Date(row.expires_at).getTime() <= nowMs) continue;
        void markPillSeen(row.id);
      }
    }).catch(() => {
      if (cancelled) return;
      setRows([]);
      setDisables([]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, dealId, workspaceId, days]);

  const handleFeedback = React.useCallback(
    async (lineId: string, feedback: PillFeedback) => {
      // Optimistic update
      setRows((prev) =>
        prev.map((r) =>
          r.id === lineId
            ? { ...r, user_feedback: feedback, feedback_at: new Date().toISOString() }
            : r,
        ),
      );
      const result = await submitPillFeedback(lineId, feedback);
      if (!result.success) {
        toast.error(result.error ?? 'Could not save feedback.');
      }
    },
    [],
  );

  const handleResurface = React.useCallback(
    async (signalType: string) => {
      const result = await resurfaceMutedReason(workspaceId, signalType);
      if (!result.success) {
        toast.error(result.error ?? 'Resurface failed.');
        return;
      }
      setDisables((prev) => prev.filter((d) => d.signal_type !== signalType));
      toast.success(`${SIGNAL_LABEL[signalType] ?? signalType} signals resumed.`);
    },
    [workspaceId],
  );

  const { activeRows, recentDismissed, olderDismissed } = React.useMemo(
    () => splitRows(rows),
    [rows],
  );

  const hasContent = rows.length > 0;
  const hasOlderDismissed = olderDismissed.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" ariaLabel="Aion pill history">
        <SheetHeader>
          <SheetTitle>
            <span className="flex items-center gap-2">
              <History size={16} strokeWidth={1.5} aria-hidden />
              History
            </span>
          </SheetTitle>
        </SheetHeader>

        <SheetBody className="space-y-4">
          {disables.length > 0 && (
            <div className="space-y-2">
              {disables.map((d) => (
                <MutedStrip
                  key={d.signal_type}
                  disable={d}
                  onResurface={() => handleResurface(d.signal_type)}
                />
              ))}
            </div>
          )}

          {loading && (
            <p className="text-[0.82rem] text-[var(--stage-text-tertiary)]">Loading…</p>
          )}
          {!loading && !hasContent && (
            <p className="text-[0.88rem] text-[var(--stage-text-tertiary)]">
              No lines yet.
            </p>
          )}
          {!loading && hasContent && (
            <>
              {[...activeRows, ...recentDismissed].length > 0 && (
                <Timeline
                  rows={[...activeRows, ...recentDismissed]}
                  onFeedback={handleFeedback}
                />
              )}

              {hasOlderDismissed && (
                <div className="border-t border-[var(--stage-edge-subtle)] pt-3">
                  <button
                    type="button"
                    onClick={() => setShowOlderDismissed((v) => !v)}
                    className={cn(
                      'flex items-center gap-1.5 text-[0.76rem]',
                      'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
                      'transition-colors duration-[80ms]',
                    )}
                    aria-expanded={showOlderDismissed}
                  >
                    {showOlderDismissed ? '▾' : '▸'} Dismissed history ({olderDismissed.length})
                  </button>
                  {showOlderDismissed && (
                    <div className="mt-2">
                      <Timeline rows={olderDismissed} onFeedback={handleFeedback} archived />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function splitRows(rows: PillHistoryRow[]): {
  activeRows: PillHistoryRow[];
  recentDismissed: PillHistoryRow[];
  olderDismissed: PillHistoryRow[];
} {
  const cutoff = Date.now() - RECENT_DISMISSAL_DAYS * 24 * 60 * 60 * 1000;
  const activeRows: PillHistoryRow[] = [];
  const recentDismissed: PillHistoryRow[] = [];
  const olderDismissed: PillHistoryRow[] = [];
  for (const row of rows) {
    if (row.dismissed_at) {
      const ts = new Date(row.dismissed_at).getTime();
      if (ts >= cutoff) recentDismissed.push(row);
      else olderDismissed.push(row);
    } else {
      activeRows.push(row);
    }
  }
  return { activeRows, recentDismissed, olderDismissed };
}

// ───────────────────────────────────────────────────────────────────────────

function MutedStrip({
  disable,
  onResurface,
}: {
  disable: ActiveSignalDisable;
  onResurface: () => void;
}) {
  const label = SIGNAL_LABEL[disable.signal_type] ?? disable.signal_type;
  const until = new Date(disable.disabled_until).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-[6px] px-3 py-2',
        'border border-[var(--stage-edge-subtle)]',
        'bg-[var(--ctx-well)]',
        'text-[0.82rem] text-[var(--stage-text-secondary)]',
      )}
      data-testid="pill-history-muted-strip"
    >
      <span>
        {label} signals paused until {until}
        <span className="text-[var(--stage-text-tertiary)] ml-1.5 text-[0.76rem]">
          {disable.fires_sampled} sampled · {disable.not_useful_count} not relevant
        </span>
      </span>
      <button
        type="button"
        onClick={onResurface}
        className={cn(
          'shrink-0 rounded-[4px] px-2 py-0.5 text-[0.76rem]',
          'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
          'hover:bg-[oklch(1_0_0_/_0.06)]',
          'transition-colors duration-[80ms]',
        )}
      >
        Resurface
      </button>
    </div>
  );
}

export { Timeline } from './PillHistoryTimeline';
export const PILL_SIGNAL_LABEL = SIGNAL_LABEL;

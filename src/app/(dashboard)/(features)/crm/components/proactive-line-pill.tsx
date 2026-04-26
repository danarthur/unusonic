'use client';

/**
 * Proactive-line pill on the deal card.
 *
 * Wk 10 D5/D7 update — three dismiss reasons replace the single ×:
 *   - "Got it" (already_handled)   — tunes hit-rate, doesn't mute (G)
 *   - "Not relevant" (not_useful)  — feeds D6/D8 mute math          (D)
 *   - "Later" (snooze)             — 24h floor, all gates still apply (N)
 *
 * The pill stamps `seen_at` once on mount via cortex.mark_pill_seen so the
 * 72h badge clears even if the owner reads-and-walks-away. Dismissal also
 * counts as seen (the RPC stamps via COALESCE — first stamp wins).
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.7
 */

import * as React from 'react';
import { AlertCircle, DollarSign, Eye, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import {
  dismissProactiveLine,
  getActiveProactiveLine,
  type DismissReason,
  type ProactiveLine,
} from '../actions/proactive-line-actions';
import { markPillSeen } from '@/app/(dashboard)/(features)/aion/actions/pill-history-actions';

interface ProactiveLinePillProps {
  line: ProactiveLine;
  /** Called when the user clicks the headline to open the thread. */
  onAsk: (line: ProactiveLine) => void;
}

const SIGNAL_ICON = {
  money_event: DollarSign,
  proposal_engagement: Eye,
  dead_silence: Clock,
} as const;

const SIGNAL_LABEL = {
  money_event: 'Money',
  proposal_engagement: 'Engagement',
  dead_silence: 'Silence',
} as const;

// Owner-facing labels per Wk 10 D5 lock. Telemetry field names live in the
// reason column; UI never shows them.
type DismissAffordance = {
  label: string;
  reason: DismissReason;
  hotkey: 'g' | 'd' | 'n';
  hotkeyDisplay: 'G' | 'D' | 'N';
};

const DISMISS_AFFORDANCES: readonly DismissAffordance[] = [
  { label: 'Got it',       reason: 'already_handled', hotkey: 'g', hotkeyDisplay: 'G' },
  { label: 'Not relevant', reason: 'not_useful',      hotkey: 'd', hotkeyDisplay: 'D' },
  { label: 'Later',        reason: 'snooze',          hotkey: 'n', hotkeyDisplay: 'N' },
] as const;

export function ProactiveLinePill({ line, onAsk }: ProactiveLinePillProps) {
  const [hidden, setHidden] = React.useState(false);
  const [pendingReason, setPendingReason] = React.useState<DismissReason | null>(null);
  const [, startTransition] = React.useTransition();
  const Icon = SIGNAL_ICON[line.signal_type] ?? AlertCircle;
  const label = SIGNAL_LABEL[line.signal_type] ?? 'Aion';
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  // D7 — pinned-pill render counts as seen (design Q2). Idempotent on the
  // server; first stamp wins.
  React.useEffect(() => {
    if (!line?.id) return;
    void markPillSeen(line.id);
  }, [line?.id]);

  const handleDismiss = React.useCallback(
    (reason: DismissReason) => {
      if (pendingReason !== null) return;
      setPendingReason(reason);
      setHidden(true);
      startTransition(async () => {
        const result = await dismissProactiveLine(line.id, reason);
        if (!result.success) {
          setHidden(false);
          setPendingReason(null);
          toast.error(result.error ?? 'Could not dismiss that.');
        }
      });
    },
    [line.id, pendingReason],
  );

  // Hotkeys G / D / N work when the pill (or its descendants) hold focus.
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const k = event.key.toLowerCase();
      const hit = DISMISS_AFFORDANCES.find((a) => a.hotkey === k);
      if (hit) {
        event.preventDefault();
        handleDismiss(hit.reason);
      }
    },
    [handleDismiss],
  );

  const handleAsk = React.useCallback(() => {
    onAsk(line);
  }, [line, onAsk]);

  if (hidden) return null;

  return (
    <div
      ref={containerRef}
      role="alert"
      aria-label={`${label} signal \u2014 ${line.headline}`}
      data-signal-type={line.signal_type}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2',
        'rounded-[6px]',
        'border border-[oklch(1_0_0_/_0.08)]',
        'bg-[oklch(1_0_0_/_0.03)]',
        'transition-colors duration-[120ms]',
        'hover:bg-[oklch(1_0_0_/_0.05)]',
        'hover:border-[oklch(1_0_0_/_0.12)]',
        'focus:outline-none focus-visible:border-[oklch(1_0_0_/_0.18)]',
      )}
    >
      <Icon
        size={14}
        strokeWidth={1.75}
        className="shrink-0 text-[var(--stage-text-tertiary)]"
        aria-hidden
      />
      <button
        type="button"
        onClick={handleAsk}
        className={cn(
          'flex-1 text-left text-[0.88rem] leading-[1.35]',
          'text-[var(--stage-text-primary)]',
          'focus:outline-none focus-visible:underline',
        )}
      >
        {line.headline}
        <span className="ml-1.5 text-[0.76rem] text-[var(--stage-text-tertiary)]">
          Ask Aion →
        </span>
      </button>
      <div
        className={cn(
          'shrink-0 flex items-center gap-2 text-[0.76rem]',
          'text-[var(--stage-text-tertiary)]',
          // Visible by default on touch / always-on-mobile via media query;
          // fades in on hover/focus on desktop. Stage Engineering: subtle.
          'opacity-0 group-hover:opacity-100',
          'group-focus-within:opacity-100',
          '[@media(hover:none)]:opacity-100',
        )}
        aria-label="Dismiss options"
      >
        {DISMISS_AFFORDANCES.map((a, idx) => (
          <React.Fragment key={a.reason}>
            {idx > 0 && (
              <span aria-hidden className="text-[var(--stage-text-tertiary)] opacity-50">
                ·
              </span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleDismiss(a.reason); }}
              disabled={pendingReason !== null}
              aria-keyshortcuts={a.hotkeyDisplay}
              aria-label={`${a.label} — dismiss as ${a.reason} (${a.hotkeyDisplay})`}
              className={cn(
                'rounded-[4px] px-1.5 py-0.5',
                'hover:text-[var(--stage-text-secondary)]',
                'hover:bg-[oklch(1_0_0_/_0.06)]',
                'transition-colors duration-[80ms]',
                'focus:outline-none focus-visible:text-[var(--stage-text-primary)]',
                pendingReason !== null && 'opacity-50 cursor-not-allowed',
              )}
            >
              {a.label}
            </button>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

interface ProactiveLineContainerProps {
  dealId: string;
  /** Called when the user clicks the headline. */
  onAsk: (line: ProactiveLine) => void;
}

export function ProactiveLineContainer({ dealId, onAsk }: ProactiveLineContainerProps) {
  const [line, setLine] = React.useState<ProactiveLine | null>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    getActiveProactiveLine(dealId)
      .then((result) => {
        if (cancelled) return;
        setLine(result);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLine(null);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [dealId]);

  if (!loaded || !line) return null;

  return <ProactiveLinePill line={line} onAsk={onAsk} />;
}

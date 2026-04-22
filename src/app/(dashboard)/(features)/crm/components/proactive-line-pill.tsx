'use client';

/**
 * Proactive-line pill on the deal card — Phase 2 Sprint 2 / Week 5.
 *
 * Single pinned line surfaced above the Aion voice paragraph. One pill max
 * per deal at any time. Three affordances:
 *
 *   - Click the headline → pose it as a chat question in the deal thread
 *     (user message, not system) so the conversation feels natural.
 *   - Dismiss (×) → optimistic hide + cortex.dismiss_aion_proactive_line RPC.
 *     Throttle math (2 dismisses in 14d → mute 7d) is applied server-side
 *     in the evaluator cron, not here.
 *   - No other CTAs. Plan §3.2.4: "Pill shape: signal-type icon + headline
 *     + artifact link + dismiss button. Click expands the thread with the
 *     insight auto-posted as a system message to kick off a conversation."
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.2.
 */

import * as React from 'react';
import { AlertCircle, DollarSign, Eye, Clock, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import {
  dismissProactiveLine,
  getActiveProactiveLine,
  type ProactiveLine,
} from '../actions/proactive-line-actions';

interface ProactiveLinePillProps {
  line: ProactiveLine;
  /** Called when the user clicks the headline to open the thread. The parent
   *  typically sends the headline as a user message via sendChatMessage. */
  onAsk: (line: ProactiveLine) => void;
}

// Signal-type → icon + accent mapping. Accent is a single-digit lightness
// shift within Stage's OKLCH scale; no chromatic accent per the achromatic
// design decision.
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

export function ProactiveLinePill({ line, onAsk }: ProactiveLinePillProps) {
  // Optimistic dismissal: the pill vanishes the moment the user clicks, then
  // the RPC confirms in the background. Any failure restores the pill with a
  // toast — the user stays in control.
  const [hidden, setHidden] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const Icon = SIGNAL_ICON[line.signal_type] ?? AlertCircle;
  const label = SIGNAL_LABEL[line.signal_type] ?? 'Aion';

  const handleDismiss = React.useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (isPending) return;
      setHidden(true);
      startTransition(async () => {
        const result = await dismissProactiveLine(line.id);
        if (!result.success) {
          setHidden(false);
          toast.error(result.error ?? 'Could not dismiss that.');
        }
      });
    },
    [line.id, isPending],
  );

  const handleAsk = React.useCallback(() => {
    onAsk(line);
  }, [line, onAsk]);

  if (hidden) return null;

  return (
    <div
      role="alert"
      aria-label={`${label} signal \u2014 ${line.headline}`}
      data-signal-type={line.signal_type}
      className={cn(
        'group relative flex items-center gap-2 px-3 py-2',
        'rounded-[6px]',
        'border border-[oklch(1_0_0_/_0.08)]',
        'bg-[oklch(1_0_0_/_0.03)]',
        'transition-colors duration-[120ms]',
        'hover:bg-[oklch(1_0_0_/_0.05)]',
        'hover:border-[oklch(1_0_0_/_0.12)]',
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
      <button
        type="button"
        onClick={handleDismiss}
        disabled={isPending}
        aria-label="Dismiss this alert"
        className={cn(
          'shrink-0 p-1 rounded-[4px]',
          'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
          'hover:bg-[oklch(1_0_0_/_0.06)]',
          'transition-colors duration-[80ms]',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:opacity-100',
          isPending && 'opacity-50 cursor-not-allowed',
        )}
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container — fetches the active line and renders the pill (or nothing).
// Mount in the deal card; it self-fetches so the existing AionCardData
// pipeline stays untouched.
// ---------------------------------------------------------------------------

interface ProactiveLineContainerProps {
  dealId: string;
  /** Called when the user clicks the headline. Typically wires to
   *  sendChatMessage on the deal-scoped session. */
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
        // Silent failure — the pill is an enhancement; the rest of the card
        // renders regardless.
        setLine(null);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [dealId]);

  // Render nothing until the fetch resolves so we don't flicker an empty
  // block on the initial mount.
  if (!loaded || !line) return null;

  return <ProactiveLinePill line={line} onAsk={onAsk} />;
}

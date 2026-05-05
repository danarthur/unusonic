'use client';

import { useEffect, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { Button } from '@/shared/ui/button';
import type { DismissalReason } from '@/shared/lib/triggers/schema';
import {
  acceptStageSuggestion,
  rejectStageSuggestion,
  getStageSuggestionForDeal,
} from '../actions/aion-suggestion-actions';

/**
 * AionSuggestionRow — surfaces a stage-move suggestion on a deal card.
 *
 * Single-row layout: [✓ Advance to proposal]   [× Reject]
 *
 * The row sits below a hairline (mt-2 pt-2 + stage-edge-subtle top border) so
 * it reads as a natural extension of the host card, not a crushed pill. The
 * full verb phrase lives on the button itself — no separate header, so the
 * stage label on the stream card and the button CTA don't duplicate each other.
 *
 * Reject swaps the row in place to a vertical stack of dismissal reasons
 * (popover-style block). "Other" swaps to an inline text input. All writes go
 * through server actions.
 *
 * This component self-fetches on mount — the parent passes only `dealId`.
 * Per-card fetch is acceptable for ~50-card CRM pipelines; the insight
 * query is indexed on (workspace_id, entity_id) + priority.
 *
 * Brand voice: "Advance to" not "move to" / "promote". No exclamation marks.
 */

type Suggestion = Awaited<ReturnType<typeof getStageSuggestionForDeal>>;

const DISMISSAL_OPTIONS: Array<{ value: DismissalReason; label: string }> = [
  { value: 'tire_kicker', label: 'Tire-kicker' },
  { value: 'wrong_timing', label: 'Wrong timing' },
  { value: 'manual_nudge_sent', label: 'Already nudged manually' },
  { value: 'not_ready', label: 'Not ready to advance' },
  { value: 'other', label: 'Other' },
];

// CTA copy — the full verb phrase lives on the button itself. No separate
// header: WhyThisTooltip in the deal-panel variant surfaces the reason on
// demand, and on the stream card the card's stage chip already carries the
// "where is this deal" context.
const TAG_COPY: Record<string, string> = {
  proposal_sent: 'Advance to proposal',
  contract_out: 'Advance to contract',
  contract_signed: 'Mark contract signed',
  deposit_received: 'Mark deposit received',
  won: 'Mark won',
  ready_for_handoff: 'Hand off to production',
};

function tagLabel(tag: string): string {
  return TAG_COPY[tag] ?? `Advance to ${tag.replace(/_/g, ' ')}`;
}

export function AionSuggestionRow({
  dealId,
  initialSuggestion,
  className,
  onVisibilityChange,
}: {
  dealId: string;
  /** Pre-resolved suggestion from a parent batch fetch. Three meanings:
   *   - `undefined` (prop omitted) → parent didn't check; the component
   *     fetches its own suggestion on mount.
   *   - `null` → parent checked, deal has no actionable suggestion;
   *     the component renders nothing and skips the per-deal fetch.
   *   - `Suggestion` → parent checked and resolved one; render directly.
   *
   *  Treating `null` as "skip the fetch" is the fix to the per-card N+1
   *  where the selected stream-card refetched even after the rail's batch
   *  had already covered it. */
  initialSuggestion?: Suggestion | null;
  className?: string;
  /** Fires when the row's visibility changes — true when a suggestion is
   *  rendered, false when hidden or empty. Lets the host card suppress
   *  redundant follow-up signals above this row. */
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(
    initialSuggestion ?? null,
  );
  const [prevInitial, setPrevInitial] = useState(initialSuggestion);
  const [hidden, setHidden] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<DismissalReason | null>(null);
  const [rejectText, setRejectText] = useState('');
  const [isPending, startTransition] = useTransition();

  // Mirror prop changes into local state at render time when the parent
  // batch refetches. React's recommended "adjusting state during render"
  // pattern — avoids the cascading-render cost of doing this in useEffect.
  if (initialSuggestion !== prevInitial) {
    setPrevInitial(initialSuggestion);
    setSuggestion(initialSuggestion ?? null);
  }

  // `undefined` means the parent didn't pre-resolve — fall back to a
  // per-deal fetch. Both `null` and a real Suggestion mean "parent
  // resolved" and we skip the round-trip.
  const hasInitial = initialSuggestion !== undefined;

  useEffect(() => {
    if (hasInitial) return; // parent already resolved it
    let cancelled = false;
    (async () => {
      const next = await getStageSuggestionForDeal(dealId);
      if (!cancelled) setSuggestion(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId, hasInitial]);

  const visible = !!suggestion && !hidden && !!suggestion.targetTag;

  useEffect(() => {
    onVisibilityChange?.(visible);
    return () => {
      onVisibilityChange?.(false);
    };
  }, [visible, onVisibilityChange]);

  if (!visible) return null;

  const handleAccept = () => {
    if (!suggestion.targetTag) return;
    startTransition(async () => {
      const result = await acceptStageSuggestion(
        dealId,
        suggestion.insightId,
        suggestion.targetTag!,
      );
      if (result.success) {
        setHidden(true);
        toast.success('Stage advanced.');
      } else {
        toast.error(result.error ?? 'Could not advance stage.');
      }
    });
  };

  const handleReject = (reason: DismissalReason) => {
    // "Other" needs free text before submit; the other enums commit right away.
    if (reason === 'other') {
      setRejectReason('other');
      return;
    }
    startTransition(async () => {
      const result = await rejectStageSuggestion(suggestion.insightId, reason);
      if (result.success) {
        setHidden(true);
        setRejectOpen(false);
        toast.success('Suggestion dismissed.');
      } else {
        toast.error(result.error ?? 'Could not dismiss.');
      }
    });
  };

  const handleRejectOther = () => {
    startTransition(async () => {
      const result = await rejectStageSuggestion(
        suggestion.insightId,
        'other',
        rejectText,
      );
      if (result.success) {
        setHidden(true);
        setRejectOpen(false);
        setRejectReason(null);
        setRejectText('');
        toast.success('Suggestion dismissed.');
      } else {
        toast.error(result.error ?? 'Could not dismiss.');
      }
    });
  };

  return (
    <div
      className={cn('mt-2 pt-2', className)}
      style={{ borderTop: '1px solid var(--stage-edge-subtle)' }}
      data-surface="elevated"
    >
      <AnimatePresence mode="wait" initial={false}>
        {!rejectOpen ? (
          <motion.div
            key="actions"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={STAGE_LIGHT}
            className="flex items-center gap-1.5"
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={handleAccept}
              className="flex-1 min-w-0"
            >
              <Check className="size-3.5" />
              <span className="truncate">
                {suggestion.targetTag ? tagLabel(suggestion.targetTag) : 'Accept'}
              </span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => setRejectOpen(true)}
              className="text-[var(--stage-text-secondary)]"
            >
              <X className="size-3.5" />
              Reject
            </Button>
          </motion.div>
        ) : rejectReason !== 'other' ? (
          <motion.div
            key="reject-options"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={STAGE_LIGHT}
            className={cn(
              'rounded-md p-1 shadow-sm',
              'bg-[var(--ctx-dropdown,var(--stage-surface-raised))]',
              'border border-[var(--stage-edge-subtle)]',
            )}
          >
            <div className="flex flex-col">
              {DISMISSAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleReject(opt.value)}
                  className={cn(
                    'text-left rounded-sm px-2 py-1.5 text-xs',
                    'hover:bg-[var(--ctx-well-hover,var(--stage-surface-raised))]',
                    'transition-colors',
                    isPending && 'opacity-50',
                  )}
                >
                  {opt.label}
                </button>
              ))}
              <button
                type="button"
                disabled={isPending}
                onClick={() => setRejectOpen(false)}
                className={cn(
                  'mt-1 text-left rounded-sm px-2 py-1 text-[11px]',
                  'text-[var(--stage-text-tertiary,var(--stage-text-secondary))]',
                  'hover:text-[var(--stage-text-secondary)] underline-offset-2 hover:underline',
                )}
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="reject-other"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={STAGE_LIGHT}
            className="flex items-center gap-1.5"
          >
            <input
              type="text"
              autoFocus
              value={rejectText}
              onChange={(e) => setRejectText(e.target.value)}
              placeholder="Why?"
              className={cn(
                'flex-1 min-w-0 rounded-sm px-2 py-1 text-xs',
                'border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)]',
              )}
              maxLength={2000}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending || rejectText.trim().length === 0}
              onClick={handleRejectOther}
            >
              Submit
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

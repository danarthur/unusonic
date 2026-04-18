'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import type { DismissalReason } from '@/shared/lib/triggers/schema';
import {
  acceptStageSuggestion,
  rejectStageSuggestion,
  getStageSuggestionForDeal,
} from '../actions/aion-suggestion-actions';

/**
 * AionSuggestionRow — surfaces a stage-move suggestion or an insight diagnostic
 * on a deal card. Two sub-rows at most:
 *
 *   • Insight chip: "● {insight title}"  [Draft nudge →] (P1)
 *   • Stage move:  "★ Advance to {tag}?"  [✓ Accept]  [× Reject ▾]
 *
 * Reject opens a popover with 4 enum reasons + "other" (free text).
 * All writes go through server actions.
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

// Map tags to the verb phrase shown on the Accept button. Unknown tags fall
// back to a generic label — never leak a raw identifier.
const TAG_COPY: Record<string, string> = {
  proposal_sent: 'Advance to Proposal',
  contract_out: 'Advance to Contract',
  contract_signed: 'Mark Contract Signed',
  deposit_received: 'Mark Deposit Received',
  won: 'Mark Won',
  ready_for_handoff: 'Hand off to production',
};

function tagLabel(tag: string): string {
  return TAG_COPY[tag] ?? `Advance to ${tag.replace(/_/g, ' ')}`;
}

export function AionSuggestionRow({
  dealId,
  className,
}: {
  dealId: string;
  className?: string;
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [hidden, setHidden] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<DismissalReason | null>(null);
  const [rejectText, setRejectText] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await getStageSuggestionForDeal(dealId);
      if (!cancelled) setSuggestion(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  if (!suggestion || hidden || !suggestion.targetTag) return null;

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
      className={cn(
        'flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm',
        'border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]',
        className,
      )}
      data-surface="elevated"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span aria-hidden className="text-[var(--stage-text-secondary)]">★</span>
        <span className="truncate">{suggestion.title}</span>
      </div>

      {!rejectOpen ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={isPending}
            onClick={handleAccept}
            className={cn(
              'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs',
              'bg-[var(--stage-surface-raised)] hover:bg-[var(--stage-surface-raised-hover,var(--stage-surface-raised))]',
              'border border-[var(--stage-edge-subtle)]',
              isPending && 'opacity-50',
            )}
          >
            <Check className="size-3" />
            {suggestion.targetTag ? tagLabel(suggestion.targetTag) : 'Accept'}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => setRejectOpen(true)}
            className={cn(
              'inline-flex items-center gap-1 rounded-sm px-2 py-1 text-xs',
              'bg-[var(--stage-surface)] hover:bg-[var(--stage-surface-raised)]',
              'border border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)]',
              isPending && 'opacity-50',
            )}
          >
            <X className="size-3" />
            Reject
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-end gap-2 shrink-0 text-xs">
          {rejectReason !== 'other' ? (
            <div className="flex flex-wrap gap-1 justify-end">
              {DISMISSAL_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleReject(opt.value)}
                  className={cn(
                    'rounded-sm px-2 py-1',
                    'bg-[var(--stage-surface)] hover:bg-[var(--stage-surface-raised)]',
                    'border border-[var(--stage-edge-subtle)]',
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
                className="rounded-sm px-2 py-1 text-[var(--stage-text-secondary)] underline-offset-2 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={rejectText}
                onChange={(e) => setRejectText(e.target.value)}
                placeholder="Why?"
                className="rounded-sm border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] px-2 py-1 text-xs"
                maxLength={2000}
              />
              <button
                type="button"
                disabled={isPending || rejectText.trim().length === 0}
                onClick={handleRejectOther}
                className="rounded-sm border border-[var(--stage-edge-subtle)] bg-surface-raised px-2 py-1 text-xs"
              >
                Submit
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

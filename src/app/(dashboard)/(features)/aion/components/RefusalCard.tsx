'use client';

/**
 * RefusalCard — Phase 3.4 renderer for the `refusal` content type.
 *
 * Sibling of AnalyticsResultCard, NOT a variant. Refusals happen when a user
 * asks for something that isn't in the metric registry. The card states the
 * limitation in one sentence, optionally surfaces the closest near-match, and
 * offers 2-3 concrete alternatives via SuggestionChips.
 *
 * Voice: dry, specific, no apology. Sentence case, no exclamation marks.
 *
 * @module app/(dashboard)/(features)/aion/components/RefusalCard
 */

import * as React from 'react';
import { CircleSlash2 } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import type { Refusal, SuggestionChip } from '../lib/aion-chat-types';

interface RefusalCardProps {
  refusal: Refusal;
  /** Dispatches a chip's `value` as a new user message. Wired in AionMessageRenderer. */
  onSuggestionTap?: (chip: SuggestionChip) => void;
}

/**
 * Renders a refusal block. Uses StagePanel `stripe="warning"` — refusals are
 * informational, not errors (the RPC didn't fail; we just don't have that
 * metric).
 */
export function RefusalCard({ refusal, onSuggestionTap }: RefusalCardProps) {
  const handleSuggestionTap = React.useCallback(
    (chip: SuggestionChip) => {
      onSuggestionTap?.(chip);
    },
    [onSuggestionTap],
  );

  const attemptedMetricChip: SuggestionChip | null =
    refusal.attemptedMetricId
      ? {
          // "Try that?" CTA — falls back to id when title wasn't resolvable.
          label: refusal.attemptedMetricTitle
            ? `Try ${refusal.attemptedMetricTitle}`
            : `Try ${refusal.attemptedMetricId}`,
          // Synthetic message the chat route will route through call_metric.
          value: `Run ${refusal.attemptedMetricId}`,
        }
      : null;

  return (
    <StagePanel
      stripe="warning"
      padding="md"
      elevated
      className="flex flex-col gap-3"
      data-testid="refusal-card"
    >
      <header className="flex items-start gap-2">
        <CircleSlash2
          size={16}
          strokeWidth={1.75}
          aria-hidden
          className="mt-0.5 shrink-0 text-[var(--color-unusonic-warning)]"
        />
        <p
          className="text-sm leading-snug text-[var(--stage-text-primary)]"
          data-testid="refusal-text"
        >
          {refusal.text}
        </p>
      </header>

      {refusal.attemptedMetricId && (
        <p
          className="text-xs text-[var(--stage-text-secondary)] leading-snug"
          data-testid="refusal-attempted"
        >
          {refusal.attemptedMetricTitle ? (
            <>The closest I have is <span className="font-medium text-[var(--stage-text-primary)]">{refusal.attemptedMetricTitle}</span>.</>
          ) : (
            <>The closest I have is <span className="font-mono">{refusal.attemptedMetricId}</span>.</>
          )}
        </p>
      )}

      {(refusal.suggestions && refusal.suggestions.length > 0) || attemptedMetricChip ? (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Alternative questions"
          data-testid="refusal-suggestions"
        >
          {attemptedMetricChip && (
            <ChipButton
              chip={attemptedMetricChip}
              onTap={handleSuggestionTap}
              variant="primary"
              testId="refusal-attempted-chip"
            />
          )}
          {refusal.suggestions?.map((chip, i) => (
            <ChipButton
              key={`${chip.label}-${i}`}
              chip={chip}
              onTap={handleSuggestionTap}
              variant="secondary"
              testId="refusal-suggestion-chip"
            />
          ))}
        </div>
      ) : null}
    </StagePanel>
  );
}

// ── Chip primitive ─────────────────────────────────────────────────────────
// Matches the inline chip styling used by SuggestionChipsInline in
// ChatInterface.tsx; refusals should feel continuous with Aion's normal chip
// UX rather than introducing a new pattern.

interface ChipButtonProps {
  chip: SuggestionChip;
  onTap: (chip: SuggestionChip) => void;
  variant: 'primary' | 'secondary';
  testId: string;
}

function ChipButton({ chip, onTap, variant, testId }: ChipButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onTap(chip)}
      className={cn(
        'stage-btn shrink-0 px-3 py-1 text-xs font-medium rounded-full',
        'transition-colors duration-[80ms]',
        variant === 'primary' ? 'stage-btn-primary' : 'stage-btn-secondary',
      )}
      data-testid={testId}
    >
      {chip.label}
    </button>
  );
}

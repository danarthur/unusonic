'use client';

/**
 * CaptureComposer — dual-mode capture affordance at the top of the brief card.
 *
 * One unified input row that accepts both typed and voice input:
 *
 *   ┌─────────────────────────────────────────────┬──────┐
 *   │  Tell Aion something…                       │  🎤  │
 *   └─────────────────────────────────────────────┴──────┘
 *
 *   • Type + Enter       → parses the text directly (skips mic)
 *   • Click mic          → opens the modal at idle, auto-starts recording
 *   • Shift+C (anywhere) → global keyboard shortcut, handled by CaptureProvider
 *
 * Both paths land in the same review card — the modal handles everything
 * downstream. The composer is just the on-ramp.
 *
 * Two density tiers driven by `CaptureProvider.hasEverCaptured`:
 *   • first-run: input + mic + one-line hint above — louder discoverability
 *   • compact:   input + mic only
 *
 * No provider → feature flag off → renders nothing.
 *
 * See docs/reference/sales-brief-v2-design.md §10.1.
 */

import * as React from 'react';
import { Mic, ArrowRight } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useOptionalCapture } from '@/widgets/lobby-capture/ui/CaptureProvider';

export interface CaptureComposerProps {
  className?: string;
}

export function CaptureComposer({ className }: CaptureComposerProps) {
  const capture = useOptionalCapture();
  const [value, setValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  if (!capture) return null;

  const { openCapture, hasEverCaptured } = capture;
  const trimmed = value.trim();
  const canSubmit = trimmed.length >= 3;

  const submitTyped = () => {
    if (!canSubmit) return;
    openCapture({ initialText: trimmed });
    setValue('');
    inputRef.current?.blur();
  };

  const startVoice = () => {
    // Any in-progress typed draft is discarded — picking up the mic is a
    // clear intent to restart. The placeholder returns immediately.
    setValue('');
    openCapture();
  };

  return (
    <div className={cn('w-full space-y-1.5', className)}>
      {!hasEverCaptured && (
        <p className="px-1 text-[11px] text-[var(--stage-text-tertiary)]">
          Tell Aion a client, a meeting, a thought — I&rsquo;ll remember.
        </p>
      )}

      <div
        className={cn(
          'w-full flex items-center gap-1 rounded-md',
          'border border-[var(--stage-edge-subtle)]',
          'bg-[var(--stage-surface-elevated)]',
          'focus-within:border-[var(--stage-accent)]/40',
          'transition-colors',
        )}
        data-surface="elevated"
      >
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSubmit) {
              e.preventDefault();
              submitTyped();
            }
          }}
          placeholder="Tell Aion something…"
          aria-label="Capture a thought — type or press the mic"
          className={cn(
            'flex-1 min-w-0 bg-transparent border-none outline-none',
            'px-3 py-2 text-sm',
            'text-[var(--stage-text-primary)]',
            'placeholder:text-[var(--stage-text-tertiary)]',
          )}
          data-testid="capture-composer-input"
        />

        {canSubmit ? (
          <button
            type="button"
            onClick={submitTyped}
            aria-label="Send to Aion"
            title="Send (Enter)"
            className={cn(
              'shrink-0 inline-flex items-center justify-center',
              'w-8 h-8 rounded-md mr-1',
              'text-[var(--stage-text-primary)]',
              'hover:bg-[oklch(1_0_0/0.08)] transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
            )}
            data-testid="capture-composer-send"
          >
            <ArrowRight className="w-4 h-4" strokeWidth={1.75} />
          </button>
        ) : (
          <button
            type="button"
            onClick={startVoice}
            aria-label="Record voice note"
            title="Record voice note (Shift+C)"
            className={cn(
              'shrink-0 inline-flex items-center justify-center',
              'w-8 h-8 rounded-md mr-1',
              'text-[var(--stage-text-secondary)]',
              'hover:text-[var(--stage-text-primary)]',
              'hover:bg-[oklch(1_0_0/0.08)] transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
            )}
            data-testid="capture-composer-mic"
          >
            <Mic className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
}

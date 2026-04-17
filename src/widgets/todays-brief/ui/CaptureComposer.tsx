'use client';

/**
 * CaptureComposer — inline capture affordance at the top of the brief card.
 *
 * Two states driven by whether the user has ever confirmed a capture:
 *
 *   • first-run (hasEverCaptured=false): warm + instrumental explanation,
 *     recruits first use without feeling like onboarding spam.
 *   • compact     (hasEverCaptured=true):  minimum visual footprint,
 *     placeholder-only "Tell Aion something…".
 *
 * Taps trigger the lobby-level CaptureProvider. If no provider is mounted
 * (feature flag off), this component renders nothing. `Shift+C` is handled
 * globally by the provider.
 *
 * See docs/reference/sales-brief-v2-design.md §10.1.
 */

import * as React from 'react';
import { motion } from 'framer-motion';
import { Mic } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { useOptionalCapture } from '@/widgets/lobby-capture/ui/CaptureProvider';

export interface CaptureComposerProps {
  hasEverCaptured: boolean;
  className?: string;
}

export function CaptureComposer({ hasEverCaptured, className }: CaptureComposerProps) {
  const capture = useOptionalCapture();

  // No provider → flag off. Render nothing; the brief card still shows
  // paragraph + insight rows below.
  if (!capture) return null;

  const { openCapture } = capture;

  if (!hasEverCaptured) {
    return <FirstRunState onOpen={openCapture} className={className} />;
  }
  return <CompactState onOpen={openCapture} className={className} />;
}

// ── States ───────────────────────────────────────────────────────────────────

function FirstRunState({
  onOpen,
  className,
}: {
  onOpen: () => void;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      transition={STAGE_LIGHT}
      whileHover={{ backgroundColor: 'var(--stage-surface-raised)' }}
      className={cn(
        'w-full text-left flex items-start gap-3 p-4',
        'rounded-md border border-dashed border-[var(--stage-edge-subtle)]',
        'bg-[var(--stage-surface-elevated)]',
        'text-[var(--stage-text-secondary)]',
        'hover:text-[var(--stage-text-primary)] transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
        className,
      )}
      data-testid="capture-composer-first-run"
      aria-label="Tell Aion something — capture a thought"
    >
      <Mic
        className="w-4 h-4 mt-0.5 shrink-0 text-[var(--stage-text-primary)]"
        aria-hidden
      />
      <span className="text-sm leading-snug">
        Hey &mdash; tap here or press{' '}
        <kbd className="inline-flex items-center h-4 px-1 mx-0.5 text-[10px] font-mono rounded border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well,var(--stage-surface))] text-[var(--stage-text-tertiary)]">
          Shift C
        </kbd>{' '}
        and tell me what&rsquo;s on your mind. A client, a meeting, a thought
        you don&rsquo;t want to forget. I&rsquo;ll figure out who it&rsquo;s
        about and remind you when it matters.
      </span>
    </motion.button>
  );
}

function CompactState({
  onOpen,
  className,
}: {
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'w-full text-left inline-flex items-center gap-2 px-3 py-2',
        'rounded-md border border-[var(--stage-edge-subtle)]',
        'bg-[var(--stage-surface-elevated)]',
        'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
        'transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/50',
        className,
      )}
      data-testid="capture-composer-compact"
      aria-label="Tell Aion something"
      title="Tell Aion something (Shift+C)"
    >
      <Mic className="w-3.5 h-3.5 shrink-0" aria-hidden />
      <span className="text-xs">Tell Aion something…</span>
    </button>
  );
}

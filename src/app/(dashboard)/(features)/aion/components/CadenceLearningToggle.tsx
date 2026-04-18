'use client';

/**
 * Cadence-learning opt-in toggle (Fork C, Ext B).
 *
 * Workspace-level switch for Aion to analyze the owner's past follow-up
 * cadence and personalize suggestions. Default off — opt-in, not opt-out
 * (GDPR Art 22 compliance, Critic P0-6).
 *
 * Copy is explicit per design doc §20.9:
 *   > "Let Aion learn your follow-up habits to personalize suggestions.
 *      Turn off anytime — we'll forget within 30 days."
 *
 * Drop-in component; can live inside the Brain tab, a workspace settings
 * page, or an onboarding checklist. Takes the initial state as a prop so
 * the server component can hydrate without a round-trip flash.
 */

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/utils';
import { setLearnOwnerCadence } from '../actions/aion-config-actions';

export function CadenceLearningToggle({
  initialEnabled,
  className,
}: {
  initialEnabled: boolean;
  className?: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, startTransition] = useTransition();

  const handleChange = (next: boolean) => {
    const prev = enabled;
    setEnabled(next); // optimistic
    startTransition(async () => {
      const result = await setLearnOwnerCadence(next);
      if (!result.success) {
        setEnabled(prev);
        toast.error(result.error ?? 'Could not save preference.');
        return;
      }
      toast.success(
        next
          ? 'Aion will start learning your cadence.'
          : 'Turned off. We\u2019ll forget your cadence within 30 days.',
      );
    });
  };

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-md p-3',
        'border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)]',
        className,
      )}
    >
      <div className="flex flex-col gap-1 min-w-0">
        <label
          htmlFor="aion-learn-cadence"
          className="text-sm font-medium"
          style={{ color: 'var(--stage-text-primary)' }}
        >
          Personalize Aion with your follow-up history
        </label>
        <p
          className="text-xs leading-relaxed"
          style={{ color: 'var(--stage-text-secondary)' }}
        >
          Aion analyzes your past follow-ups to learn your rhythm and adapt its
          suggestions to your pace. Turn off anytime &mdash; we&rsquo;ll forget
          within 30 days.
        </p>
      </div>

      <button
        id="aion-learn-cadence"
        role="switch"
        aria-checked={enabled}
        disabled={isPending}
        onClick={() => handleChange(!enabled)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-edge-strong,var(--stage-text-secondary))]',
          enabled
            ? 'bg-[var(--stage-text-primary)]/90'
            : 'bg-[var(--stage-edge-subtle)]',
          isPending && 'opacity-60',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'inline-block size-4 rounded-full bg-[var(--stage-surface)] transition-transform',
            enabled ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X } from 'lucide-react';
import { STAGE_HEAVY } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export interface SaveBarProps {
  /** When true, bar is visible (slide up from bottom). */
  isDirty: boolean;
  onReset: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  className?: string;
}

/**
 * SaveBar – Floating bar that slides up from the bottom when the form has unsaved changes.
 * Actions: Reset (undo) and Lock (commit).
 */
export function SaveBar({
  isDirty,
  onReset,
  onSubmit,
  isSubmitting = false,
  error = null,
  className,
}: SaveBarProps) {
  return (
    <AnimatePresence>
      {isDirty && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={STAGE_HEAVY}
          className={cn(
            'fixed bottom-6 left-1/2 z-30 -translate-x-1/2',
            'flex items-center justify-between gap-4 px-4 py-3 rounded-[var(--stage-radius-panel)]',
            'bg-[var(--stage-surface-raised)] border border-[oklch(1_0_0_/_0.10)] shadow-[0_12px_40px_oklch(0_0_0_/_0.35)]',
            'min-w-[min(100%-2rem,360px)]',
            className
          )}
        >
          <span className="text-sm font-medium text-[var(--stage-text-secondary)]">Unsaved changes</span>
          {error && (
            <span className="text-sm text-[var(--color-unusonic-error)] truncate flex-1 min-w-0 mx-2" role="alert">
              {error}
            </span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onReset}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
            >
              <X className="size-4" strokeWidth={1.5} />
              Reset
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-on-accent)] bg-[var(--stage-accent)] hover:bg-[oklch(0.90_0_0)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
            >
              {isSubmitting ? (
                <span className="opacity-70">Locking…</span>
              ) : (
                <>
                  <Save className="size-4" strokeWidth={1.5} />
                  Lock
                </>
              )}
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

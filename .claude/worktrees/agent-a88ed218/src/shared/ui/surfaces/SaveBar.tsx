'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Save, X } from 'lucide-react';
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
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={cn(
            'fixed bottom-6 left-1/2 z-30 -translate-x-1/2',
            'liquid-card flex items-center justify-between gap-4 px-4 py-3 rounded-2xl',
            'border-mercury shadow-[var(--glass-shadow)]',
            'min-w-[min(100%-2rem,360px)]',
            className
          )}
        >
          <span className="text-sm font-medium text-ink-muted">Unsaved changes</span>
          {error && (
            <span className="text-sm text-neon-rose truncate flex-1 min-w-0 mx-2" role="alert">
              {error}
            </span>
          )}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onReset}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ceramic hover:bg-ceramic/10 transition-colors focus:outline-none focus:ring-2 focus:ring-neon-blue/40 disabled:opacity-50"
            >
              <X className="size-4" />
              Reset
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-obsidian bg-ceramic hover:bg-ceramic/90 transition-colors focus:outline-none focus:ring-2 focus:ring-neon-blue/40 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span className="animate-pulse">Locking…</span>
              ) : (
                <>
                  <Save className="size-4" />
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

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

export type ContextualAlert = {
  id: string;
  type: string;
  title: string;
  detail: string;
  cta?: string;
  parentCardId: string;
};

interface ContextualCardDrawerProps {
  alert: ContextualAlert | null;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Drawer physics: contextual card slides out from underneath the parent.
 * Implies relationship — the parent card contained this insight.
 */
export function ContextualCardDrawer({ alert, onDismiss, className }: ContextualCardDrawerProps) {
  return (
    <AnimatePresence>
      {alert && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={STAGE_LIGHT}
          className={cn('mt-3', className)}
        >
          <div className="stage-panel-nested mt-2 rounded-2xl border border-[oklch(1_0_0_/_0.08)] p-4 flex flex-col gap-2">
            <span className="stage-label">
              Contextual
            </span>
            <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">{alert.title}</p>
            <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">{alert.detail}</p>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="mt-2 stage-label text-[var(--stage-accent)] hover:underline self-start"
              >
                Dismiss
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

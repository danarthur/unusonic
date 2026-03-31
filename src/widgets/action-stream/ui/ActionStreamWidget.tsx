'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STUB_SUGGESTED_ACTIONS, type SuggestedAction } from '../lib/suggested-actions';
import {
  M3_FADE_THROUGH_ENTER,
  M3_FADE_THROUGH_EXIT,
  M3_SHARED_AXIS_Y_VARIANTS,
} from '@/shared/lib/motion-constants';

type ActionStreamWidgetProps = {
  actions?: SuggestedAction[];
  onInteraction?: () => void;
};

type CardState = 'idle' | 'loading' | 'success';

/**
 * Action Stream — Aion Suggested Actions with in-card execution.
 * Click CTA → loading → checkmark → card exits. No modal; clear from lobby.
 */
export function ActionStreamWidget({
  actions: initialActions = STUB_SUGGESTED_ACTIONS,
}: ActionStreamWidgetProps) {
  const [actions, setActions] = useState<SuggestedAction[]>(initialActions);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleExecute = (id: string) => {
    setExecutingId(id);
    // Stub: simulate Aion execution (replace with real API call).
    setTimeout(() => {
      setExecutingId(null);
      setSuccessId(id);
      setTimeout(() => {
        setActions((prev) => prev.filter((a) => a.id !== id));
        setSuccessId(null);
      }, 600);
    }, 800);
  };

  return (
    <WidgetShell icon={Sparkles} label="Action Stream" className="overflow-hidden">
      <div className="overflow-y-auto min-h-0 space-y-3">
        <AnimatePresence mode="popLayout">
          {actions.map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              state={
                executingId === action.id ? 'loading' : successId === action.id ? 'success' : 'idle'
              }
              onExecute={() => handleExecute(action.id)}
            />
          ))}
        </AnimatePresence>
        {actions.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-[var(--stage-text-secondary)] leading-relaxed py-2"
          >
            No suggested actions right now.
          </motion.p>
        )}
      </div>
    </WidgetShell>
  );
}

/** Individual action card — elevated surface sitting on the panel. */
function ActionCard({
  action,
  state,
  onExecute,
}: {
  action: SuggestedAction;
  state: CardState;
  onExecute: () => void;
}) {
  const isDone = state === 'success';

  return (
    <motion.div
      layout
      initial={M3_SHARED_AXIS_Y_VARIANTS.hidden}
      animate={{
        opacity: isDone ? 0 : 1,
        y: 0,
        scale: isDone ? 0.95 : 1,
      }}
      exit={{ opacity: 0, scale: 0.95, transition: M3_FADE_THROUGH_EXIT }}
      transition={M3_FADE_THROUGH_ENTER}
      className="stage-panel-elevated rounded-[var(--stage-radius-nested)] overflow-hidden cursor-pointer transition-[filter] hover:brightness-[1.04]"
    >
      <button
        type="button"
        onClick={state === 'idle' ? onExecute : undefined}
        disabled={state !== 'idle'}
        className="relative w-full text-left p-4 flex items-start justify-between gap-3 rounded-[var(--stage-radius-nested)] disabled:pointer-events-none min-h-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset"
      >
        {state === 'loading' && (
          <span className="absolute inset-0 flex items-center justify-center bg-[var(--stage-surface-elevated)]/90 rounded-[var(--stage-radius-nested)]">
            <Loader2 className="w-6 h-6 text-[var(--stage-accent)] animate-spin" strokeWidth={1.5} aria-hidden />
          </span>
        )}
        {state === 'success' && (
          <span className="absolute inset-0 flex items-center justify-center rounded-[var(--stage-radius-nested)]">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-unusonic-success)]/20 text-[var(--color-unusonic-success)]"
            >
              <Check className="w-5 h-5" aria-hidden />
            </motion.span>
          </span>
        )}
        {state === 'idle' && (
          <>
            <div className="min-w-0 flex-1 overflow-hidden py-0.5">
              <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight leading-snug break-words">
                {action.title}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed mt-1 break-words">
                {action.detail}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-[var(--stage-accent)] pt-0.5 text-right" title={action.cta}>
              {action.cta}
            </span>
          </>
        )}
      </button>
    </motion.div>
  );
}

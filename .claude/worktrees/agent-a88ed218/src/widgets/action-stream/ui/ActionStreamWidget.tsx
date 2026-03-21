'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Check, Loader2 } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { STUB_SUGGESTED_ACTIONS, type SuggestedAction } from '../lib/suggested-actions';
import {
  M3_FADE_THROUGH_ENTER,
  M3_FADE_THROUGH_EXIT,
  M3_SHARED_AXIS_Y_VARIANTS,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

type ActionStreamWidgetProps = {
  actions?: SuggestedAction[];
  onInteraction?: () => void;
};

type CardState = 'idle' | 'loading' | 'success';

/**
 * Action Stream — ION Suggested Actions with in-card execution.
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
    // Stub: simulate ION execution (replace with real API call).
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
    <LiquidPanel hoverEffect className="h-full flex flex-col min-h-0 !p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--glass-border)] shrink-0">
        <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight flex items-center gap-2">
          <Zap className="w-4 h-4 text-neon" aria-hidden />
          Action Stream
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
        <motion.div
          className="space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: {
                staggerChildren: M3_STAGGER_CHILDREN,
                delayChildren: M3_STAGGER_DELAY,
              },
            },
            hidden: {},
          }}
        >
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
              className="text-xs text-muted leading-relaxed py-2"
            >
              No suggested actions right now.
            </motion.p>
          )}
        </motion.div>
      </div>
    </LiquidPanel>
  );
}

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
      whileHover={state === 'idle' ? { scale: 1.02 } : undefined}
      whileTap={state === 'idle' ? { scale: 0.98 } : undefined}
      className="liquid-card-nested rounded-2xl border border-[var(--glass-border)] overflow-hidden cursor-pointer"
    >
      <button
        type="button"
        onClick={state === 'idle' ? onExecute : undefined}
        disabled={state !== 'idle'}
        className="relative w-full text-left p-4 flex items-start justify-between gap-3 border border-transparent rounded-2xl disabled:pointer-events-none min-h-[72px] focus:outline-none focus-visible:ring-2 focus-visible:ring-neon/30 focus-visible:ring-inset"
      >
        {state === 'loading' && (
          <span className="absolute inset-0 flex items-center justify-center bg-[var(--color-glass-surface)]/90 rounded-2xl">
            <Loader2 className="w-6 h-6 text-neon animate-spin" aria-hidden />
          </span>
        )}
        {state === 'success' && (
          <span className="absolute inset-0 flex items-center justify-center rounded-2xl">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-signal-success/20 text-signal-success"
            >
              <Check className="w-5 h-5" aria-hidden />
            </motion.span>
          </span>
        )}
        {state === 'idle' && (
          <>
            <div className="min-w-0 flex-1 overflow-hidden py-0.5">
              <p className="text-sm font-medium text-ceramic tracking-tight leading-snug break-words">
                {action.title}
              </p>
              <p className="text-xs text-muted leading-relaxed mt-1 break-words">
                {action.detail}
              </p>
            </div>
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-neon pt-0.5 text-right" title={action.cta}>
              {action.cta}
            </span>
          </>
        )}
      </button>
    </motion.div>
  );
}

/**
 * ScoutThoughtLog – ION thought process + recommendation in one window.
 * During scan: thought steps only. When done: thought log + suggested persona · tier so user sees why.
 * M3 fade-through for steps.
 * @module features/onboarding/ui/scout-thought-log
 */

'use client';

import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  M3_DURATION_S,
  M3_EASING_ENTER,
  M3_EASING_EXIT,
} from '@/shared/lib/motion-constants';

interface ScoutThoughtLogProps {
  steps: string[];
  /** When present (after scan), shown below the thought log so user sees why we recommend. */
  suggestion?: string | null;
  className?: string;
}

/** Single step: M3 fade-through (opacity + slight y). Latest step gets full transition. */
const stepTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transitionEnter: { duration: M3_DURATION_S, ease: M3_EASING_ENTER },
  transitionExit: { duration: M3_DURATION_S * 0.7, ease: M3_EASING_EXIT },
};

export function ScoutThoughtLog({ steps, suggestion, className }: ScoutThoughtLogProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list || steps.length === 0) return;
    list.scrollTop = list.scrollHeight;
  }, [steps.length]);

  const hasContent = steps.length > 0 || suggestion;

  if (!hasContent) return null;

  return (
    <div
      className={className}
      role="log"
      aria-live="polite"
      aria-label="ION thought log and recommendation"
    >
      {suggestion && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER }}
          className="rounded-xl bg-ink/5 border border-[var(--glass-border)] px-4 py-3 mb-4"
        >
          <p className="text-[10px] uppercase tracking-widest text-mercury/60 mb-1.5">
            Recommendation
          </p>
          <p className="text-sm text-[var(--color-ink)] leading-relaxed">
            Suggested for you: <span className="text-neon font-medium">{suggestion}</span>
          </p>
        </motion.div>
      )}
      {steps.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-widest text-mercury/60 mb-2">
            Thought log
          </p>
          <div
            tabIndex={0}
            className="max-h-12 focus-within:max-h-24 transition-[max-height] duration-300 ease-out rounded-lg outline-none focus-within:ring-1 focus-within:ring-[var(--color-mercury)]/20 focus-within:ring-inset"
          >
            <ul
              ref={listRef}
              className="space-y-1.5 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain scroll-smooth"
            >
              <AnimatePresence initial={false}>
                {steps.map((line, i) => (
                  <motion.li
                    key={`${i}-${line.slice(0, 20)}`}
                    initial={stepTransition.initial}
                    animate={stepTransition.animate}
                    exit={stepTransition.exit}
                    transition={
                      i === steps.length - 1
                        ? stepTransition.transitionEnter
                        : { duration: 0.15 }
                    }
                    className="text-xs text-mercury flex items-center gap-2 shrink-0"
                  >
                    <span className="text-neon/70 shrink-0">→</span>
                    <span>{line}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

const FALLBACK_STEPS = ['Reading context', 'Analyzing', 'Composing'];
const FALLBACK_DELAYS = [0, 1000, 2500];

interface AionThinkingStepsProps {
  /** Real tool label from the stream (e.g. "get deal details") */
  activeToolLabel?: string | null;
}

export function AionThinkingSteps({ activeToolLabel }: AionThinkingStepsProps) {
  const [fallbackCount, setFallbackCount] = useState(1);
  const [toolLabels, setToolLabels] = useState<string[]>([]);

  // Progressive fallback steps when no real tool labels arrive
  useEffect(() => {
    if (activeToolLabel) return; // real labels take over
    const timers = FALLBACK_DELAYS.slice(1).map((delay, i) =>
      setTimeout(() => setFallbackCount(i + 2), delay),
    );
    return () => timers.forEach(clearTimeout);
  }, [activeToolLabel]);

  // Accumulate real tool labels as they arrive
  useEffect(() => {
    if (!activeToolLabel) return;
    setToolLabels(prev => {
      if (prev[prev.length - 1] === activeToolLabel) return prev;
      return [...prev, activeToolLabel];
    });
  }, [activeToolLabel]);

  const steps = activeToolLabel || toolLabels.length > 0
    ? toolLabels
    : FALLBACK_STEPS.slice(0, fallbackCount);

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <AnimatePresence>
        {steps.map((step, i) => {
          const isActive = i === steps.length - 1;
          return (
            <motion.div
              key={step}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: isActive ? 1 : 0.4, x: 0 }}
              transition={STAGE_LIGHT}
              className="flex items-center gap-2.5"
            >
              {isActive ? (
                <motion.span
                  className="block w-1.5 h-1.5 rounded-full shrink-0 bg-[var(--stage-accent)]"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
              ) : (
                <span className="block w-1 h-1 rounded-full shrink-0 bg-[var(--stage-text-tertiary)]" />
              )}
              <span className={cn(
                'stage-label font-mono text-field-label',
                isActive ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--stage-text-tertiary)]',
              )}>
                {step}
                {isActive && '...'}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

export interface PipelineTrackerProps {
  currentStage: number;
  stages: string[];
  className?: string;
}

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export function PipelineTracker({ currentStage, stages, className }: PipelineTrackerProps) {
  const total = stages.length;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between gap-1">
        {stages.map((label, index) => {
          const isCompleted = index < currentStage;
          const isCurrent = index === currentStage;
          const isPending = index > currentStage;
          const isLast = index === total - 1;

          return (
            <React.Fragment key={index}>
              <div className="flex flex-1 flex-col items-center min-w-0">
                {/* Step circle */}
                <motion.div
                  layout
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium tabular-nums',
                    isCompleted &&
                      'border-emerald-500/80 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
                    isCurrent &&
                      'border-amber-500/90 bg-amber-500/20 text-amber-800 dark:text-amber-200 shadow-[0_0_0_0_rgba(245,158,11,0.4)]',
                    isPending &&
                      'border-[var(--glass-border)] bg-[var(--glass-bg)]/50 text-ink-muted'
                  )}
                  animate={
                    isCurrent
                      ? {
                          boxShadow: [
                            '0 0 0 0 rgba(245, 158, 11, 0)',
                            '0 0 0 8px rgba(245, 158, 11, 0.15)',
                            '0 0 0 0 rgba(245, 158, 11, 0)',
                          ],
                        }
                      : undefined
                  }
                  transition={
                    isCurrent
                      ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
                      : spring
                  }
                >
                  {isCompleted ? (
                    <svg
                      className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </motion.div>
                <span
                  className={cn(
                    'mt-1.5 truncate text-center text-xs font-medium max-w-full',
                    isCurrent && 'text-amber-700 dark:text-amber-300',
                    isCompleted && 'text-emerald-700 dark:text-emerald-300',
                    isPending && 'text-ink-muted'
                  )}
                  title={label}
                >
                  {label}
                </span>
              </div>
              {/* Connector line */}
              {!isLast && (
                <motion.div
                  className="h-0.5 flex-1 min-w-[8px] max-w-[24px] rounded-full mx-0.5"
                  initial={false}
                  animate={{
                    backgroundColor: index < currentStage ? 'rgb(16, 185, 129)' : 'var(--glass-border)',
                  }}
                  transition={spring}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

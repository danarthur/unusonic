'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

export interface PipelineTrackerProps {
  currentStage: number;
  stages: string[];
  className?: string;
}

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
const spring = STAGE_MEDIUM;

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
                      'border-[oklch(0.65_0.18_145_/_0.8)] bg-[oklch(0.45_0.05_145_/_0.15)] text-[var(--color-unusonic-success)]',
                    isCurrent &&
                      'border-[oklch(0.65_0.15_70_/_0.9)] bg-[oklch(0.45_0.05_70_/_0.2)] text-[var(--color-unusonic-warning)] shadow-[0_0_0_0_oklch(0.7_0.15_70_/_0.4)]',
                    isPending &&
                      'border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]/50 text-[var(--stage-text-secondary)]'
                  )}
                  animate={
                    isCurrent
                      ? {
                          boxShadow: [
                            '0 0 0 0 oklch(0.7 0.15 70 / 0)',
                            '0 0 0 8px oklch(0.7 0.15 70 / 0.15)',
                            '0 0 0 0 oklch(0.7 0.15 70 / 0)',
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
                      className="h-4 w-4 text-[var(--color-unusonic-success)]"
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
                    isCurrent && 'text-[var(--color-unusonic-warning)]',
                    isCompleted && 'text-[var(--color-unusonic-success)]',
                    isPending && 'text-[var(--stage-text-secondary)]'
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
                    backgroundColor: index < currentStage ? 'oklch(0.65 0.17 162)' : 'oklch(1 0 0 / 0.08)',
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

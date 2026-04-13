/**
 * Payment Timeline (The Cash Horizon) – Issue → Now (pulsating dot) → Due
 * Track turns red (Overdue) when Now > End and balance > 0.
 * @module features/finance/ui/widgets/PaymentTimeline
 */

'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { PaymentTimelineDTO } from '../../model/types';

export interface PaymentTimelineProps {
  timeline: PaymentTimelineDTO | null;
  className?: string;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function PaymentTimeline({ timeline, className }: PaymentTimelineProps) {
  const { positionPct, isPastDue, isFuture, isOverdue } = useMemo(() => {
    if (!timeline) {
      return { positionPct: 50, isPastDue: false, isFuture: false, isOverdue: false };
    }
    const issue = new Date(timeline.issueDate).getTime();
    const due = new Date(timeline.dueDate).getTime();
    const today = new Date(timeline.today).getTime();
    const outstanding = timeline.outstanding ?? 0;
    if (due <= issue) {
      const isPastDue = today > due;
      return {
        positionPct: 50,
        isPastDue,
        isFuture: today < issue,
        isOverdue: isPastDue && outstanding > 0,
      };
    }
    const positionPct = Math.min(
      100,
      Math.max(0, ((today - issue) / (due - issue)) * 100)
    );
    const isPastDue = today > due;
    const isOverdue = isPastDue && outstanding > 0;
    return {
      positionPct,
      isPastDue,
      isFuture: today < issue,
      isOverdue,
    };
  }, [timeline]);

  if (!timeline) {
    return (
      <StagePanel className={`flex flex-col gap-5 p-6 min-h-[200px] ${className ?? ''}`}>
        <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] shrink-0">
          Payment Timeline
        </h2>
        <p className="text-sm text-[var(--stage-text-secondary)] mt-1">No invoice dates yet</p>
      </StagePanel>
    );
  }

  return (
    <StagePanel className={`flex flex-col gap-6 p-6 min-h-[200px] min-w-0 ${className ?? ''}`}>
      <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] shrink-0">
        Cash Horizon
      </h2>

      {/* Labels row: Issue | Now | Due */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="stage-label mb-0.5">Issue</p>
          <p className="text-sm font-medium text-[var(--stage-text-primary)] leading-tight">
            {formatShortDate(timeline.issueDate)}
          </p>
        </div>
        <div className="flex flex-col items-center justify-end">
          <p className="stage-label mb-0.5">Now</p>
          <span className="text-sm font-medium text-[var(--stage-text-primary)]">Today</span>
        </div>
        <div className="text-right">
          <p className="stage-label mb-0.5">Due</p>
          <p className="text-sm font-medium text-[var(--stage-text-primary)] leading-tight">
            {formatShortDate(timeline.dueDate)}
          </p>
        </div>
      </div>

      {/* Track with pulsating dot */}
      <div className="relative w-full h-2 flex items-center px-0">
        <div
          className={`absolute inset-x-0 h-1.5 rounded-full transition-colors ${
            isOverdue ? 'bg-[var(--color-unusonic-error)]' : 'bg-[oklch(1_0_0_/_0.08)]'
          }`}
          aria-hidden
        />
        <motion.div
          className="absolute w-4 h-4 rounded-full bg-[var(--stage-accent)] -translate-x-1/2 z-10 border-2 border-[var(--stage-surface)]"
          style={{ left: `${positionPct}%` }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0.82, 1, 0.82],
          }}
          transition={{
            opacity: {
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
          aria-hidden
        />
      </div>

      {(isPastDue || isFuture) && (
        <p className="text-xs text-[var(--stage-text-secondary)] shrink-0 mt-1">
          {isOverdue ? 'Overdue — balance due' : isPastDue ? 'Due date passed' : 'Before issue date'}
        </p>
      )}
    </StagePanel>
  );
}

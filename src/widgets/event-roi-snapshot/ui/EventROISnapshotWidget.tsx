'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { StagePanel } from '@/shared/ui/stage-panel';
import { M3_DURATION_S, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

const M3_ENTER = { duration: M3_DURATION_S, ease: M3_EASING_ENTER };

/**
 * Event ROI Snapshot — projected gear/talent costs vs actual revenue for upcoming gigs (stub).
 */
export function EventROISnapshotWidget() {
  return (
    <StagePanel padding="md" className="h-full flex flex-col min-h-0">
      <h2 className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest tracking-tight mb-4">
        Event ROI Snapshot
      </h2>
      <motion.div
        className="flex flex-col gap-3 flex-1"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
          hidden: {},
        }}
      >
        <motion.div
          variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
          transition={M3_ENTER}
          className="rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface)] p-4 flex justify-between items-center"
        >
          <span className="text-xs text-[var(--stage-text-secondary)]">Projected cost</span>
          <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">$4,200</span>
        </motion.div>
        <motion.div
          variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
          transition={M3_ENTER}
          className="rounded-xl border border-[oklch(1_0_0_/_0.10)] bg-[var(--stage-surface)] p-4 flex justify-between items-center"
        >
          <span className="text-xs text-[var(--stage-text-secondary)]">Revenue (est.)</span>
          <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight">$8,500</span>
        </motion.div>
      </motion.div>
    </StagePanel>
  );
}

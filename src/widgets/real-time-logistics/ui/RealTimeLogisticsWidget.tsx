'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Package, Mic } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { M3_DURATION_S, M3_EASING_ENTER } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';

const M3_ENTER = { duration: M3_DURATION_S, ease: M3_EASING_ENTER };
const META = METRICS['lobby.real_time_logistics'];

/** State B center: Real-time Logistics — equipment alerts or passive data cues (stub). */
export function RealTimeLogisticsWidget() {
  // TODO(phase-5): replace stub with a real logistics fetcher. When that lands,
  // empty-state rendering is already wired below — the registry owns the copy.
  const cues = [
    { id: '1', text: 'Load-in confirmed via Voice-to-Text', icon: Mic, status: 'success' },
    { id: '2', text: 'Backline checklist complete', icon: Package, status: 'success' },
  ];
  const isEmpty = cues.length === 0;

  return (
    <StagePanel className="h-full flex flex-col min-h-0">
      <h2 className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest tracking-tight mb-4">
        {META.title}
      </h2>
      {isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-4 min-h-0">
          <Package
            className="w-8 h-8 text-[var(--stage-text-secondary)] opacity-20"
            strokeWidth={1}
            aria-hidden
          />
          <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
            {META.emptyState.body}
          </p>
        </div>
      ) : (
        <motion.div
          className="flex flex-col gap-2 flex-1 min-h-0"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
            hidden: {},
          }}
        >
          {cues.map((cue) => (
            <motion.div
              key={cue.id}
              variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
              transition={M3_ENTER}
              className="stage-panel-nested p-3 flex items-center gap-3"
            >
              <cue.icon className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0" />
              <span className="text-sm text-[var(--stage-text-primary)] tracking-tight leading-relaxed flex-1 min-w-0">
                {cue.text}
              </span>
              <span className="inline-flex h-2 w-2 rounded-full bg-[var(--color-unusonic-success)] shrink-0" aria-hidden />
            </motion.div>
          ))}
        </motion.div>
      )}
    </StagePanel>
  );
}

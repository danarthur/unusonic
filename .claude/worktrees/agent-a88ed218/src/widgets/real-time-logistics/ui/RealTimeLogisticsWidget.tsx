'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Package, Mic } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { M3_DURATION_S, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

const M3_ENTER = { duration: M3_DURATION_S, ease: M3_EASING_ENTER };

/** State B center: Real-time Logistics — equipment alerts or passive data cues (stub). */
export function RealTimeLogisticsWidget() {
  const cues = [
    { id: '1', text: 'Load-in confirmed via Voice-to-Text', icon: Mic, status: 'success' },
    { id: '2', text: 'Backline checklist complete', icon: Package, status: 'success' },
  ];

  return (
    <LiquidPanel className="h-full flex flex-col min-h-0">
      <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight mb-4">
        Real-time Logistics
      </h2>
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
            className="liquid-card-nested p-3 flex items-center gap-3"
          >
            <cue.icon className="w-4 h-4 text-muted shrink-0" />
            <span className="text-sm text-ceramic tracking-tight leading-relaxed flex-1 min-w-0">
              {cue.text}
            </span>
            <span className="inline-flex h-2 w-2 rounded-full bg-signal-success shrink-0" aria-hidden />
          </motion.div>
        ))}
      </motion.div>
    </LiquidPanel>
  );
}

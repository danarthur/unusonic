'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Mail, Music2, Loader2 } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { M3_DURATION_S, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

const M3_ENTER = { duration: M3_DURATION_S, ease: M3_EASING_ENTER };

const SOURCES = [
  { id: 'calendar', label: 'Calendar', icon: Calendar, syncing: true },
  { id: 'email', label: 'Email', icon: Mail, syncing: false },
  { id: 'spotify', label: 'Spotify', icon: Music2, syncing: true },
];

/**
 * Passive Pipeline Feed — "Syncing" indicator for calendar, email, Spotify (stub).
 */
export function PassivePipelineFeedWidget() {
  return (
    <LiquidPanel className="h-full flex flex-col min-h-0">
      <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight mb-4">
        Passive Pipeline
      </h2>
      <motion.div
        className="flex flex-col gap-2"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } },
          hidden: {},
        }}
      >
        {SOURCES.map((s) => (
          <motion.div
            key={s.id}
            variants={{ hidden: { opacity: 0, y: 6 }, visible: { opacity: 1, y: 0 } }}
            transition={M3_ENTER}
            className="liquid-card-nested p-3 flex items-center gap-3"
          >
            <s.icon className="w-4 h-4 text-muted shrink-0" />
            <span className="text-sm text-ceramic tracking-tight flex-1">{s.label}</span>
            {s.syncing ? (
              <Loader2 className="w-4 h-4 text-neon animate-spin shrink-0" aria-hidden />
            ) : (
              <span className="inline-flex h-2 w-2 rounded-full bg-signal-success shrink-0" aria-hidden />
            )}
          </motion.div>
        ))}
      </motion.div>
    </LiquidPanel>
  );
}

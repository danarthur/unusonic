'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Activity } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import {
  STAGE_LIGHT,
} from '@/shared/lib/motion-constants';

/** Micro-chart stub: client emotional trends (neutral / accent positive / warning at risk). */
const STUB_POINTS = [
  { label: 'Mon', value: 0.6, status: 'neutral' as const },
  { label: 'Tue', value: 0.7, status: 'positive' as const },
  { label: 'Wed', value: 0.5, status: 'neutral' as const },
  { label: 'Thu', value: 0.8, status: 'positive' as const },
  { label: 'Fri', value: 0.4, status: 'at_risk' as const },
];

/**
 * Sentiment Pulse — micro-chart showing client mood from passive email ingestion (stub).
 */
export function SentimentPulseWidget() {
  const maxVal = Math.max(...STUB_POINTS.map((p) => p.value));

  return (
    <WidgetShell icon={Activity} label="Sentiment Pulse">
      <motion.div
        className="flex items-end gap-2 flex-1 min-h-[80px] h-20"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.03 } },
          hidden: {},
        }}
      >
        {STUB_POINTS.map((p) => (
          <motion.div
            key={p.label}
            variants={{ hidden: { opacity: 0, scaleY: 0 }, visible: { opacity: 1, scaleY: 1 } }}
            transition={STAGE_LIGHT}
            className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
          >
            <div
              className="w-full rounded-t min-h-[6px] max-h-full border border-[oklch(1_0_0_/_0.08)]"
              style={{
                height: maxVal ? `${(p.value / maxVal) * 100}%` : '0%',
                backgroundColor:
                  p.status === 'positive'
                    ? 'var(--stage-accent)'
                    : p.status === 'at_risk'
                      ? 'var(--color-unusonic-warning)'
                      : 'oklch(0.55 0 0)',
                opacity: p.status === 'positive' ? 0.85 : p.status === 'at_risk' ? 0.55 : 0.65,
              }}
            />
            <span className="text-label text-[var(--stage-text-secondary)] font-medium shrink-0">{p.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </WidgetShell>
  );
}

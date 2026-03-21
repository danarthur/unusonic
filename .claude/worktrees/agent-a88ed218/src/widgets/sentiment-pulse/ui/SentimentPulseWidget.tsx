'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import {
  M3_FADE_THROUGH_ENTER,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

/** Micro-chart stub: client emotional trends (Ceramic neutral, Neon positive, Muted at risk). */
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
    <LiquidPanel className="h-full flex flex-col min-h-0">
      <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight mb-4">
        Sentiment Pulse
      </h2>
      <motion.div
        className="flex items-end gap-2 flex-1 min-h-[80px] h-20"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: {
              staggerChildren: M3_STAGGER_CHILDREN,
              delayChildren: M3_STAGGER_DELAY,
            },
          },
          hidden: {},
        }}
      >
        {STUB_POINTS.map((p) => (
          <motion.div
            key={p.label}
            variants={{ hidden: { opacity: 0, scaleY: 0 }, visible: { opacity: 1, scaleY: 1 } }}
            transition={M3_FADE_THROUGH_ENTER}
            className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
          >
            <div
              className="w-full rounded-t liquid-card-nested min-h-[6px] max-h-full"
              style={{
                height: maxVal ? `${(p.value / maxVal) * 100}%` : '0%',
                backgroundColor:
                  p.status === 'positive'
                    ? 'var(--color-neon-blue)'
                    : p.status === 'at_risk'
                      ? 'var(--color-muted)'
                      : 'var(--color-ceramic)',
                opacity: p.status === 'positive' ? 0.9 : p.status === 'at_risk' ? 0.6 : 0.7,
              }}
            />
            <span className="text-[10px] text-muted font-medium shrink-0">{p.label}</span>
          </motion.div>
        ))}
      </motion.div>
    </LiquidPanel>
  );
}

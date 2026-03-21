'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { usePipelineVelocity } from '../lib/use-pipeline-velocity';
import {
  M3_FADE_THROUGH_ENTER,
  M3_SHARED_AXIS_X_VARIANTS,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

interface PipelineVelocityWidgetProps {
  /** Subsurface ION glow when ION has a contextual suggestion */
  ionHint?: boolean;
}

/**
 * State A hero: Pipeline Velocity — leads moving toward Booked.
 * Data strips (no tables); Liquid Glass; stagger.
 */
export function PipelineVelocityWidget({ ionHint = false }: PipelineVelocityWidgetProps) {
  const { stages, loading, error } = usePipelineVelocity();
  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  return (
    <LiquidPanel hoverEffect ionHint={ionHint} className="h-full flex flex-col justify-between min-h-[280px]">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight">
          Pipeline Velocity
        </h2>
        <Link
          href="/crm"
          className="text-muted hover:text-ceramic transition-colors"
          aria-label="View Production Queue"
        >
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col gap-3 justify-center">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 liquid-card-nested animate-pulse rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-muted leading-relaxed">{error}</p>
      ) : (
        <motion.div
          className="flex flex-col gap-3 flex-1"
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
          {stages.map((stage) => (
            <motion.div
              key={stage.key}
              variants={M3_SHARED_AXIS_X_VARIANTS}
              transition={M3_FADE_THROUGH_ENTER}
              className="flex items-center gap-3"
            >
              <span className="text-xs font-medium text-ceramic tracking-tight w-20 shrink-0">
                {stage.label}
              </span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden bg-[var(--color-obsidian)]/50 border border-[var(--glass-border)]">
                <motion.div
                  className="h-full rounded-lg bg-neon-blue/30 border-r border-neon-blue/40"
                  initial={{ width: 0 }}
                  animate={{ width: `${maxCount ? (stage.count / maxCount) * 100 : 0}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 24 }}
                />
              </div>
              <span className="text-xs font-medium text-muted tabular-nums w-6 text-right">
                {stage.count}
              </span>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Link href="/crm" className="block w-full mt-4">
        <motion.button
          type="button"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={M3_FADE_THROUGH_ENTER}
          className="w-full m3-btn-outlined text-[10px] uppercase tracking-wider"
        >
          View Pipeline
        </motion.button>
      </Link>
    </LiquidPanel>
  );
}

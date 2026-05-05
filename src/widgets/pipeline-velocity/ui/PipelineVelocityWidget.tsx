'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { usePipelineVelocity } from '../lib/use-pipeline-velocity';
import {
  STAGE_LIGHT,
  STAGE_MEDIUM,
} from '@/shared/lib/motion-constants';

interface PipelineVelocityWidgetProps {
  /** Subsurface Aion glow when Aion has a contextual suggestion */
  ionHint?: boolean;
}

/**
 * State A hero: Pipeline Velocity — leads moving toward Booked.
 * Data strips (no tables); Stage surfaces; stagger.
 */
export function PipelineVelocityWidget({ ionHint = false }: PipelineVelocityWidgetProps) {
  const { stages, loading, error } = usePipelineVelocity();
  const maxCount = Math.max(1, ...stages.map((s) => s.count));

  return (
    <WidgetShell
      icon={TrendingUp}
      label="Pipeline Velocity"
      href="/productions"
      hrefLabel="View Production Queue"
      loading={loading}
      skeletonRows={5}
      empty={!loading && !!error}
      emptyMessage={error || 'Unable to load pipeline data.'}
      className="min-h-[280px]"
    >
      <div className="flex flex-col gap-3 flex-1">
        {stages.map((stage) => (
          <motion.div
            key={stage.key}
            variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }}
            transition={STAGE_LIGHT}
            className="flex items-center gap-3"
          >
            <span className="text-xs font-medium text-[var(--stage-text-primary)] tracking-tight w-20 shrink-0">
              {stage.label}
            </span>
            <div className="flex-1 h-6 rounded-lg overflow-hidden bg-[oklch(1_0_0_/_0.06)] border border-[oklch(1_0_0_/_0.10)]">
              <motion.div
                className="h-full rounded-lg bg-[var(--stage-accent)]/25 border-r border-[var(--stage-accent)]/35"
                initial={{ width: 0 }}
                animate={{ width: `${maxCount ? (stage.count / maxCount) * 100 : 0}%` }}
                transition={STAGE_MEDIUM}
              />
            </div>
            <span className="text-xs font-medium text-[var(--stage-text-secondary)] tabular-nums w-6 text-right">
              {stage.count}
            </span>
          </motion.div>
        ))}
      </div>

      <Link
        href="/productions"
        className="mt-4 flex w-full items-center justify-center rounded-xl border border-[oklch(1_0_0_/_0.12)] bg-transparent px-3 py-2.5 stage-label hover:bg-[oklch(1_0_0_/_0.08)] hover:text-[var(--stage-text-primary)] transition-[background-color,color]"
      >
        View Pipeline
      </Link>
    </WidgetShell>
  );
}

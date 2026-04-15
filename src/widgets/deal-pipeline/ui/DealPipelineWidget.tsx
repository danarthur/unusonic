'use client';

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import {
  STAGE_LIGHT,
  STAGE_MEDIUM,
  STAGE_STAGGER_CHILDREN,
} from '@/shared/lib/motion-constants';
import type { DealPipelineDTO } from '@/widgets/dashboard/api';
import { METRICS } from '@/shared/lib/metrics/registry';

const META = METRICS['lobby.deal_pipeline'];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCompactCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

/**
 * OKLCH lightness progression: darkest for earliest stage, brightest for latest.
 * Lightness ranges from 0.35 to 0.85, achromatic (no chroma).
 */
function stageLightness(index: number, total: number): string {
  if (total <= 1) return 'oklch(0.60 0 0)';
  const l = 0.35 + (index / (total - 1)) * 0.5;
  return `oklch(${l.toFixed(2)} 0 0)`;
}

// ── Animation ──────────────────────────────────────────────────────────────

const barContainerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: STAGE_STAGGER_CHILDREN,
      delayChildren: 0.08,
    },
  },
};

// ── Component ──────────────────────────────────────────────────────────────

interface DealPipelineWidgetProps {
  data?: DealPipelineDTO;
  loading?: boolean;
}

export function DealPipelineWidget({ data, loading }: DealPipelineWidgetProps) {
  const router = useRouter();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const totalValue = useMemo(() => {
    if (!data?.stages.length) return 0;
    return data.stages.reduce((sum, s) => sum + s.totalValue, 0);
  }, [data]);

  const isEmpty = !data || data.stages.length === 0;

  return (
    <WidgetShell
      icon={GitBranch}
      label={META.title}
      href="/crm"
      hrefLabel="View all deals"
      loading={loading}
      empty={isEmpty && !loading}
      emptyMessage={META.emptyState.body}
      skeletonRows={4}
    >
      {data && data.stages.length > 0 && (
        <div className="flex flex-col gap-4 h-full justify-center">
          {/* Weighted total */}
          <p className="stage-readout-sm shrink-0" style={{ color: 'var(--stage-text-secondary)' }}>
            {formatCompactCurrency(data.totalWeightedValue)} weighted
            <span className="ml-2 opacity-50">{data.totalDeals} deals</span>
          </p>

          {/* Segmented bar */}
          <div className="relative shrink-0">
            <motion.div
              className="flex h-8 rounded-[var(--stage-radius-input,6px)] overflow-hidden gap-px"
              style={{ background: 'var(--stage-void, oklch(0.13 0.004 50))' }}
              initial="hidden"
              animate="visible"
              variants={barContainerVariants}
            >
              {data.stages.map((stage, i) => {
                const pct = totalValue > 0
                  ? Math.max(2, (stage.totalValue / totalValue) * 100)
                  : 100 / data.stages.length;

                return (
                  <motion.button
                    key={stage.status}
                    className="relative cursor-pointer border-0 outline-none transition-opacity"
                    style={{
                      width: `${pct}%`,
                      background: stageLightness(i, data.stages.length),
                      minWidth: '2%',
                    }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{
                      ...STAGE_MEDIUM,
                      delay: i * STAGE_STAGGER_CHILDREN,
                    }}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onClick={() => router.push(`/crm?status=${stage.status}`)}
                    aria-label={`${stage.label}: ${stage.count} deals, ${formatCompactCurrency(stage.totalValue)}`}
                  />
                );
              })}
            </motion.div>

            {/* Tooltip */}
            <AnimatePresence>
              {hoveredIndex !== null && data.stages[hoveredIndex] && (
                <motion.div
                  key={hoveredIndex}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={STAGE_LIGHT}
                  className="absolute top-full mt-2 left-1/2 -translate-x-1/2 z-10 px-3 py-2 rounded-[var(--stage-radius-input,6px)]"
                  style={{
                    background: 'var(--stage-surface-raised, oklch(0.26 0.004 50))',
                    border: '1px solid oklch(1 0 0 / 0.06)',
                    pointerEvents: 'none',
                  }}
                >
                  <p className="stage-readout-sm whitespace-nowrap">
                    {data.stages[hoveredIndex].label}
                  </p>
                  <p className="text-xs whitespace-nowrap" style={{ color: 'var(--stage-text-secondary)' }}>
                    {data.stages[hoveredIndex].count} deal{data.stages[hoveredIndex].count !== 1 ? 's' : ''}
                    {' '}&middot;{' '}
                    {formatCompactCurrency(data.stages[hoveredIndex].totalValue)}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Stage labels below bar */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 shrink-0">
            {data.stages.map((stage, i) => (
              <button
                key={stage.status}
                className="flex flex-col items-start gap-0.5 px-1.5 py-1 cursor-pointer border-0 outline-none bg-transparent rounded-[var(--stage-radius-input,6px)] hover:bg-[oklch(1_0_0/0.08)] transition-colors"
                onClick={() => router.push(`/crm?status=${stage.status}`)}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ background: stageLightness(i, data.stages.length) }}
                  />
                  <span className="stage-label">{stage.label}</span>
                </span>
                <span className="stage-readout-sm pl-3.5">
                  {stage.count} &middot; {formatCompactCurrency(stage.totalValue)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </WidgetShell>
  );
}

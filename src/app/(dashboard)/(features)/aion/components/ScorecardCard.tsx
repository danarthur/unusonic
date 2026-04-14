'use client';

import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Sparkline } from '@/widgets/global-pulse/ui/Sparkline';
import type { ScorecardMetric } from '../lib/aion-chat-types';

interface ScorecardCardProps {
  title: string;
  metrics: ScorecardMetric[];
}

const TREND_CONFIG = {
  up: { icon: TrendingUp, color: 'text-[var(--color-unusonic-success)]' },
  down: { icon: TrendingDown, color: 'text-[var(--color-unusonic-error)]' },
  flat: { icon: Minus, color: 'text-[var(--stage-text-tertiary)]' },
} as const;

export function ScorecardCard({ title, metrics }: ScorecardCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
    >
      <StagePanel elevated className="p-4 flex flex-col gap-3">
        <p className="stage-label font-mono select-none">
          {title}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {metrics.map((metric) => {
            const trend = metric.trend ? TREND_CONFIG[metric.trend] : null;
            const TrendIcon = trend?.icon;

            return (
              <div key={metric.label} className="flex flex-col gap-1 min-w-0">
                <span className="stage-label font-mono text-[var(--stage-text-tertiary)]">
                  {metric.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-medium text-[var(--stage-text-primary)] tracking-tight tabular-nums leading-none">
                    {metric.value}
                  </span>
                  {metric.sparkline && metric.sparkline.length >= 2 && (
                    <Sparkline
                      values={metric.sparkline}
                      width={40}
                      height={16}
                      stroke={
                        metric.trend === 'up'
                          ? 'var(--color-unusonic-success)'
                          : metric.trend === 'down'
                            ? 'var(--color-unusonic-error)'
                            : 'var(--stage-accent)'
                      }
                      opacity={0.6}
                    />
                  )}
                </div>
                {metric.detail && (
                  <span className={cn('text-field-label leading-snug flex items-center gap-1', trend?.color ?? 'text-[var(--stage-text-tertiary)]')}>
                    {TrendIcon && <TrendIcon size={11} strokeWidth={1.5} />}
                    {metric.detail}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </StagePanel>
    </motion.div>
  );
}

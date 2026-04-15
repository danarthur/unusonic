'use client';

/**
 * Revenue YoY widget — lobby bento cell.
 *
 * Phase 5.1 (touring coordinator set — also usable by owner). Hero currency +
 * year-over-year delta. Sentiment follows the registry (up = positive). No
 * sparkline (hasSparkline=false on the metric).
 *
 * @module widgets/revenue-yoy
 */

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, DollarSign } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { RevenueYoyDTO } from './api/get-revenue-yoy';

export const widgetKey = 'revenue-yoy' as const;

interface RevenueYoyWidgetProps {
  data?: RevenueYoyDTO | null;
  loading?: boolean;
}

const METRIC = METRICS['finance.revenue_yoy'];
const TITLE = METRIC?.title ?? 'Revenue YoY';
const EMPTY_BODY =
  METRIC?.emptyState.body ??
  'Year-over-year revenue appears once you have payments in both periods.';

/** Positive sentiment: up = good. */
function deltaColorFor(direction: 'up' | 'down' | 'flat' | null | undefined): string {
  if (direction === 'up') return 'var(--color-unusonic-success)';
  if (direction === 'down') return 'var(--color-unusonic-warning)';
  return 'var(--stage-text-tertiary)';
}

function DirectionIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  const props = { size: 12, strokeWidth: 1.75, 'aria-hidden': true as const };
  if (direction === 'up') return <TrendingUp {...props} />;
  if (direction === 'down') return <TrendingDown {...props} />;
  return <Minus {...props} />;
}

function WidgetBody({ data }: { data: RevenueYoyDTO }) {
  const deltaColor = deltaColorFor(data.comparisonDirection);
  return (
    <motion.div
      className="flex flex-col gap-2 h-full justify-between"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STAGE_LIGHT}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="stage-readout-hero tabular-nums"
          style={{ color: 'var(--stage-text-primary)' }}
          data-testid="revenue-yoy-hero"
        >
          {data.revenueFormatted}
        </span>
        {data.comparisonDelta && data.comparisonDirection && (
          <span
            className="inline-flex items-center gap-1 text-xs tabular-nums"
            style={{ color: deltaColor }}
            data-testid="revenue-yoy-delta"
          >
            <DirectionIcon direction={data.comparisonDirection} />
            {data.comparisonDelta}
          </span>
        )}
      </div>
      {(data.secondary || data.comparisonLabel) && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          {data.secondary ?? data.comparisonLabel}
        </p>
      )}
      {data.errored && !data.secondary && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          Revenue data is unavailable right now.
        </p>
      )}
    </motion.div>
  );
}

export function RevenueYoyWidget({ data, loading }: RevenueYoyWidgetProps) {
  const showEmpty =
    !loading &&
    !data?.errored &&
    (data?.revenueValue ?? 0) === 0 &&
    !data?.secondary;

  return (
    <WidgetShell
      icon={DollarSign}
      label={TITLE}
      loading={loading}
      empty={showEmpty}
      emptyMessage={EMPTY_BODY}
      emptyIcon={DollarSign}
      skeletonRows={2}
    >
      {data && !showEmpty && <WidgetBody data={data} />}
    </WidgetShell>
  );
}

'use client';

/**
 * Aion refusal-rate widget — lobby bento cell.
 *
 * Phase 3.4 of the reports & analytics initiative. Renders the
 * `ops.aion_refusal_rate` registry metric as a Lobby card for workspace
 * owners. Hero number = refusal-rate percent; crosses into warning color at
 * the 10% alert threshold locked in the design doc.
 *
 * @module widgets/aion-refusal-rate
 */

import React from 'react';
import { motion } from 'framer-motion';
import { CircleSlash2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { AionRefusalRateDTO } from './api/get-aion-refusal-rate';

export const widgetKey = 'aion-refusal-rate' as const;

// Alert threshold from docs/reference/pages/reports-and-analytics-design.md §5.
// Above this, the hero number shifts to warning color.
const ALERT_THRESHOLD = 0.1;

interface AionRefusalRateWidgetProps {
  data?: AionRefusalRateDTO | null;
  loading?: boolean;
}

const METRIC = METRICS['ops.aion_refusal_rate'];

/**
 * Picks the hero color. Neutral under the 10% threshold, warning at or over,
 * primary when we don't have data to judge (loading / no-activity).
 */
function heroColor(data: AionRefusalRateDTO | null | undefined): string {
  if (!data || data.errored) return 'var(--stage-text-primary)';
  if (data.rateFraction >= ALERT_THRESHOLD) return 'var(--color-unusonic-warning)';
  return 'var(--stage-text-primary)';
}

/**
 * Delta color for the comparison line. Registry sets sentiment=negative for
 * this metric (up = bad), so up maps to warning, down maps to success.
 */
function deltaColorFor(direction: 'up' | 'down' | 'flat' | null | undefined): string {
  if (direction === 'up') return 'var(--color-unusonic-warning)';
  if (direction === 'down') return 'var(--color-unusonic-success)';
  return 'var(--stage-text-tertiary)';
}

function DirectionIcon({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  const props = { size: 12, strokeWidth: 1.75, 'aria-hidden': true as const };
  if (direction === 'up') return <TrendingUp {...props} />;
  if (direction === 'down') return <TrendingDown {...props} />;
  return <Minus {...props} />;
}

/**
 * Inner body of the widget. Separated so the top-level component stays inside
 * the Stage-Engineering complexity budget.
 */
function WidgetBody({ data }: { data: AionRefusalRateDTO }) {
  const color = heroColor(data);
  const deltaColor = deltaColorFor(data.comparisonDirection);
  const overThreshold = data.rateFraction >= ALERT_THRESHOLD;

  return (
    <motion.div
      className="flex flex-col gap-2 h-full justify-between"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STAGE_LIGHT}
    >
      <div className="flex items-baseline gap-2">
        <span
          className="stage-readout-hero tabular-nums"
          style={{ color }}
          data-testid="refusal-rate-hero"
          data-over-threshold={overThreshold ? 'true' : 'false'}
        >
          {data.rateFormatted}
        </span>
        {data.comparisonDelta && data.comparisonDirection && (
          <span
            className="inline-flex items-center gap-1 text-xs tabular-nums"
            style={{ color: deltaColor }}
            data-testid="refusal-rate-delta"
          >
            <DirectionIcon direction={data.comparisonDirection} />
            {data.comparisonDelta}
          </span>
        )}
      </div>

      {data.secondary && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          {data.secondary}
        </p>
      )}
      {data.errored && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          Could not compute the refusal rate right now.
        </p>
      )}
    </motion.div>
  );
}

export function AionRefusalRateWidget({ data, loading }: AionRefusalRateWidgetProps) {
  // No-activity copy ("No Aion activity in the last 30 days") lives in the
  // registry's empty state. We treat the empty state as "show the registry
  // copy" rather than hiding the card — owners should know Aion is quiet.
  const showEmpty =
    !loading && !data?.errored && (data?.rateFraction ?? 0) === 0 && !data?.secondary;

  return (
    <WidgetShell
      icon={CircleSlash2}
      label={METRIC.title}
      href="/aion"
      hrefLabel="Open Aion"
      loading={loading}
      empty={showEmpty}
      emptyMessage={METRIC.emptyState.body}
      emptyIcon={CircleSlash2}
      skeletonRows={2}
    >
      {data && !showEmpty && <WidgetBody data={data} />}
    </WidgetShell>
  );
}

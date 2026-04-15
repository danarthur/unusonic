'use client';

/**
 * Crew utilization widget — lobby bento cell.
 *
 * Phase 5.1 (touring coordinator set). Hero percent + secondary line
 * surfaced from the `ops.crew_utilization` metric. Semantic threshold
 * coloring per data-visualization-system.md §Trend Indicators: green
 * ≥ 70%, warning 40–69%, muted < 40%.
 *
 * Registry entry owns the empty-state copy; nothing here hardcodes tone.
 *
 * @module widgets/crew-utilization
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { CrewUtilizationDTO } from './api/get-crew-utilization';

export const widgetKey = 'crew-utilization' as const;

interface CrewUtilizationWidgetProps {
  data?: CrewUtilizationDTO | null;
  loading?: boolean;
}

// Registry entry may not exist yet (parallel Phase 4.2+5.4 agent owns it);
// fall back to inline copy so the widget always renders.
const METRIC = METRICS['ops.crew_utilization'];
const TITLE = METRIC?.title ?? 'Crew utilization';
const EMPTY_BODY =
  METRIC?.emptyState.body ??
  'Utilization appears once crew assignments land in the period.';

/** Green ≥70%, warning 40–69%, muted <40%. */
function heroColor(rate: number): string {
  if (rate >= 0.7) return 'var(--color-unusonic-success)';
  if (rate >= 0.4) return 'var(--color-unusonic-warning)';
  return 'var(--stage-text-tertiary)';
}

function WidgetBody({ data }: { data: CrewUtilizationDTO }) {
  const color = heroColor(data.rateFraction);
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
          data-testid="crew-utilization-hero"
        >
          {data.rateFormatted}
        </span>
      </div>
      {data.secondary && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          {data.secondary}
        </p>
      )}
      {data.errored && !data.secondary && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          Utilization is unavailable right now.
        </p>
      )}
    </motion.div>
  );
}

export function CrewUtilizationWidget({ data, loading }: CrewUtilizationWidgetProps) {
  // Empty state fires when we have no data AND no secondary copy AND no error.
  const showEmpty =
    !loading && !data?.errored && (data?.rateFraction ?? 0) === 0 && !data?.secondary;

  return (
    <WidgetShell
      icon={Users}
      label={TITLE}
      loading={loading}
      empty={showEmpty}
      emptyMessage={EMPTY_BODY}
      emptyIcon={Users}
      skeletonRows={2}
    >
      {data && !showEmpty && <WidgetBody data={data} />}
    </WidgetShell>
  );
}

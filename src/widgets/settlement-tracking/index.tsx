'use client';

/**
 * Settlement tracking widget — lobby bento cell.
 *
 * Phase 5.1 (touring coordinator). Top 3 shows with the largest settlement
 * variance on the active tour. Empty state copy comes from the registry
 * entry (`lobby.settlement_tracking`).
 *
 * @module widgets/settlement-tracking
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Receipt } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { SettlementTrackingDTO, SettlementRow } from './api/get-settlement-tracking';

export const widgetKey = 'settlement-tracking' as const;

interface SettlementTrackingWidgetProps {
  data?: SettlementTrackingDTO | null;
  loading?: boolean;
}

const METRIC = METRICS['lobby.settlement_tracking'];
const TITLE = METRIC?.title ?? 'Settlement tracking';
const EMPTY_BODY =
  METRIC?.emptyState.body ??
  'Settlement variance appears here once tour shows have received payments.';

function varianceColor(variance: number): string {
  if (variance > 0) return 'var(--color-unusonic-success)';
  if (variance < 0) return 'var(--color-unusonic-warning)';
  return 'var(--stage-text-tertiary)';
}

function Row({ row }: { row: SettlementRow }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span
        className="truncate text-[var(--stage-text-primary)]"
        title={row.event_title}
      >
        {row.event_title || 'Untitled show'}
      </span>
      <span className="tabular-nums shrink-0 text-[var(--stage-text-secondary)]">
        {row.expectedFormatted} · {row.actualFormatted}{' '}
        <span style={{ color: varianceColor(row.variance) }}>{row.variancePct}</span>
      </span>
    </div>
  );
}

export function SettlementTrackingWidget({ data, loading }: SettlementTrackingWidgetProps) {
  const showEmpty = !loading && (!data || data.rows.length === 0);

  return (
    <WidgetShell
      icon={Receipt}
      label={TITLE}
      loading={loading}
      empty={showEmpty && !data?.errored}
      emptyMessage={EMPTY_BODY}
      emptyIcon={Receipt}
      skeletonRows={3}
    >
      {data && !showEmpty && (
        <motion.div
          className="flex flex-col gap-1 h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={STAGE_LIGHT}
        >
          {data.rows.map((row) => (
            <Row key={row.event_id || row.event_title} row={row} />
          ))}
          {data.errored && (
            <p className="mt-2 text-xs text-[var(--stage-text-secondary)] leading-relaxed">
              Settlement data is unavailable right now.
            </p>
          )}
        </motion.div>
      )}
      {data?.errored && showEmpty && (
        <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
          Settlement data is unavailable right now.
        </p>
      )}
    </WidgetShell>
  );
}

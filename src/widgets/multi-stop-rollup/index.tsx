'use client';

/**
 * Multi-stop rollup widget — lobby bento cell.
 *
 * Phase 5.1 (touring coordinator). Next 3–5 markets on the active tour.
 * When no tour is active, renders the "Not on tour" empty state.
 *
 * @module widgets/multi-stop-rollup
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Route } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { MultiStopRollupDTO, TourStopRow } from './api/get-multi-stop-rollup';

export const widgetKey = 'multi-stop-rollup' as const;

interface MultiStopRollupWidgetProps {
  data?: MultiStopRollupDTO | null;
  loading?: boolean;
}

const METRIC = METRICS['lobby.multi_stop_rollup'];
const TITLE = METRIC?.title ?? 'Tour rollup';
const EMPTY_BODY = METRIC?.emptyState.body ?? 'Not on tour.';

/** Warning for pending/unadvanced; muted for neutral; success for advanced. */
function statusColor(status: string): string {
  if (status === 'advanced' || status === 'confirmed') return 'var(--color-unusonic-success)';
  if (status === 'pending' || status === 'unadvanced') return 'var(--color-unusonic-warning)';
  return 'var(--stage-text-tertiary)';
}

function statusLabel(status: string): string {
  if (!status) return '—';
  // Sentence-case-ish, keep short.
  return status.replace(/_/g, ' ');
}

function Row({ row }: { row: TourStopRow }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="truncate text-[var(--stage-text-primary)]" title={row.label}>
        {row.label}
      </span>
      <span className="tabular-nums shrink-0 flex items-center gap-2 text-[var(--stage-text-secondary)]">
        <span>{row.dateFormatted}</span>
        <span style={{ color: statusColor(row.status) }}>{statusLabel(row.status)}</span>
      </span>
    </div>
  );
}

function resolveEmptyMessage(data: MultiStopRollupDTO | null | undefined): string {
  if (data?.errored) return 'Tour data is unavailable right now.';
  if (data?.notOnTour) return 'Not on tour.';
  return EMPTY_BODY;
}

export function MultiStopRollupWidget({ data, loading }: MultiStopRollupWidgetProps) {
  const showEmpty = !loading && (!data || data.notOnTour || data.rows.length === 0);

  return (
    <WidgetShell
      icon={Route}
      label={TITLE}
      loading={loading}
      empty={showEmpty}
      emptyMessage={resolveEmptyMessage(data)}
      emptyIcon={Route}
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
            <Row key={row.event_id || row.label} row={row} />
          ))}
        </motion.div>
      )}
    </WidgetShell>
  );
}

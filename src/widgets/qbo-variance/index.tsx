'use client';

/**
 * QBO variance widget — lobby bento cell.
 *
 * Phase 1.4 of the reports & analytics initiative. First metric-registry-backed
 * widget on the Lobby. Hero number = invoice-sync variance count; secondary =
 * copy returned by `finance.metric_qbo_variance` (never hard-coded here, the
 * registry/RPC owns the empty state). Links to `/finance/reconciliation`.
 *
 * The caller (LobbyBentoGrid) is responsible for gating the render on
 * `finance:reconcile`; the data fetcher already gates the query.
 *
 * @module widgets/qbo-variance
 */

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, WifiOff, Link2Off } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { QboVarianceDTO } from './api/get-qbo-variance';

interface QboVarianceWidgetProps {
  data?: QboVarianceDTO | null;
  loading?: boolean;
}

const METRIC = METRICS['finance.qbo_variance'];

type Mode = 'disconnected' | 'errored' | 'issues' | 'clean';

function resolveMode(data: QboVarianceDTO | null | undefined): Mode {
  if (!data) return 'clean';
  if (data.disconnected) return 'disconnected';
  if (data.errored) return 'errored';
  if (data.count > 0) return 'issues';
  return 'clean';
}

function statusColorFor(mode: Mode): string {
  if (mode === 'disconnected' || mode === 'errored') return 'var(--color-unusonic-error)';
  if (mode === 'issues') return 'var(--color-unusonic-warning)';
  return 'var(--stage-text-primary)';
}

/**
 * Hero line: either a count + "issue(s)" unit, or an icon + short label for
 * disconnected / errored states. Pulls state out of the main component to
 * keep the top-level complexity inside the protocol budget.
 */
function HeroLine({
  mode,
  countFormatted,
  count,
  statusColor,
}: {
  mode: Mode;
  countFormatted: string;
  count: number;
  statusColor: string;
}) {
  if (mode === 'disconnected') {
    return (
      <div className="flex items-center gap-2">
        <Link2Off
          className="size-5 shrink-0"
          strokeWidth={1.5}
          style={{ color: statusColor }}
          aria-hidden
        />
        <span
          className="text-lg font-medium leading-tight"
          style={{ color: 'var(--stage-text-primary)' }}
        >
          Not connected
        </span>
      </div>
    );
  }

  if (mode === 'errored') {
    return (
      <div className="flex items-center gap-2">
        <WifiOff
          className="size-5 shrink-0"
          strokeWidth={1.5}
          style={{ color: statusColor }}
          aria-hidden
        />
        <span
          className="text-lg font-medium leading-tight"
          style={{ color: 'var(--stage-text-primary)' }}
        >
          Unavailable
        </span>
      </div>
    );
  }

  // clean + issues both render a count; the color is what changes.
  return (
    <>
      <span
        className="stage-readout-hero tabular-nums"
        style={{ color: statusColor }}
      >
        {countFormatted}
      </span>
      <span className="stage-label">{count === 1 ? 'issue' : 'issues'}</span>
    </>
  );
}

export function QboVarianceWidget({ data, loading }: QboVarianceWidgetProps) {
  const mode = resolveMode(data);
  const statusColor = statusColorFor(mode);

  // Empty state fires only when the RPC returned no secondary copy AND we are
  // in the clean state. Registry owns the empty copy ("All synced / …").
  const showEmpty = !loading && mode === 'clean' && !data?.secondary;

  return (
    <WidgetShell
      icon={AlertTriangle}
      label={METRIC.title}
      href="/finance/reconciliation"
      hrefLabel="Open reconciliation"
      loading={loading}
      empty={showEmpty}
      emptyMessage={METRIC.emptyState.body}
      emptyIcon={CheckCircle2}
      skeletonRows={2}
    >
      {data && !showEmpty && (
        <motion.div
          className="flex flex-col gap-2 h-full justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={STAGE_LIGHT}
        >
          <div className="flex items-baseline gap-2">
            <HeroLine
              mode={mode}
              countFormatted={data.countFormatted}
              count={data.count}
              statusColor={statusColor}
            />
          </div>

          {data.secondary && (
            <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
              {data.secondary}
            </p>
          )}
          {!data.secondary && mode === 'errored' && (
            <p className="text-xs text-[var(--stage-text-secondary)] leading-relaxed">
              Could not reach QuickBooks. Try Reconciliation for details.
            </p>
          )}
        </motion.div>
      )}
    </WidgetShell>
  );
}

/**
 * QBO sync health panel — scalar metric rendered as a status card.
 * Combines qbo_sync_health (healthy/not) and qbo_variance (issue count) into
 * a single at-a-glance panel at the top of Reconciliation.
 */
'use client';

import { StagePanel } from '@/shared/ui/stage-panel';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { MetricResult } from '@/shared/lib/metrics/call';

interface QboSyncHealthPanelProps {
  health: MetricResult;
  variance: MetricResult;
}

export function QboSyncHealthPanel({ health, variance }: QboSyncHealthPanelProps) {
  const isHealthy = health.ok && health.kind === 'scalar' && health.value.primary === 1;
  const issueCount = variance.ok && variance.kind === 'scalar' ? variance.value.primary : 0;
  const healthLabel = health.ok && health.kind === 'scalar' ? health.value.secondary ?? '' : 'Unknown';
  const varianceLabel = variance.ok && variance.kind === 'scalar' ? variance.value.secondary ?? '' : '';

  const Icon = isHealthy ? CheckCircle2 : issueCount > 0 ? AlertTriangle : XCircle;
  const iconColor = isHealthy
    ? 'text-[var(--color-unusonic-success)]'
    : issueCount > 0
      ? 'text-[var(--color-unusonic-warning)]'
      : 'text-[var(--color-unusonic-error)]';

  return (
    <StagePanel
      elevated
      padding="md"
      stripe={isHealthy ? 'success' : issueCount > 0 ? 'warning' : 'error'}
    >
      <div className="flex items-start gap-4">
        <Icon className={`size-6 shrink-0 mt-0.5 ${iconColor}`} strokeWidth={1.5} />
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <p className="stage-label font-mono text-[var(--stage-text-tertiary)]">
            QuickBooks
          </p>
          <p className="text-lg font-medium text-[var(--stage-text-primary)] leading-tight">
            {healthLabel}
          </p>
          {issueCount > 0 && (
            <p className="text-sm text-[var(--stage-text-secondary)] tabular-nums">
              {issueCount} invoice{issueCount === 1 ? '' : 's'} with sync issues
            </p>
          )}
          {varianceLabel && issueCount === 0 && (
            <p className="text-xs text-[var(--stage-text-tertiary)]">{varianceLabel}</p>
          )}
        </div>
      </div>
    </StagePanel>
  );
}

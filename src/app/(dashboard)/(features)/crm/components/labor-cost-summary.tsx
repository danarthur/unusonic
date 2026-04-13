'use client';

import { DollarSign, AlertTriangle } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { DealCrewRow } from '../actions/deal-crew';

type LaborCostSummaryProps = {
  crewRows: DealCrewRow[];
  proposalTotal: number | null;
};

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function LaborCostSummary({ crewRows, proposalTotal }: LaborCostSummaryProps) {
  const assigned = crewRows.filter((r) => r.entity_id);
  const assignedCount = assigned.length;

  if (assignedCount === 0) {
    return (
      <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
        <div className="flex items-center gap-2">
          <DollarSign size={14} className="text-[var(--stage-text-tertiary)] shrink-0" aria-hidden />
          <span className="stage-label">Labor</span>
        </div>
        <p className="text-sm tracking-tight mt-2" style={{ color: 'var(--stage-text-tertiary)' }}>
          No crew assigned
        </p>
      </StagePanel>
    );
  }

  const totalLabor = assigned.reduce((sum, r) => sum + (r.day_rate ?? 0), 0);
  const ratesMissing = assigned.filter((r) => r.day_rate == null).length;

  const projectedMargin = proposalTotal != null ? proposalTotal - totalLabor : null;
  const marginPercent = proposalTotal != null && proposalTotal > 0
    ? (projectedMargin! / proposalTotal) * 100
    : null;

  const marginPositive = projectedMargin != null && projectedMargin > 0;

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <DollarSign size={14} className="text-[var(--stage-text-tertiary)] shrink-0" aria-hidden />
        <span className="stage-label" style={{ color: 'var(--stage-text-secondary)' }}>Labor</span>
        <span className="ml-auto text-label tabular-nums" style={{ color: 'var(--stage-text-tertiary)' }}>
          {assignedCount} crew
        </span>
      </div>

      {/* Main readout */}
      <p className="stage-readout">
        {currencyFmt.format(totalLabor)}
      </p>

      {/* Proposal + margin */}
      {proposalTotal != null && (
        <div className="flex flex-col gap-1 mt-2">
          <p className="stage-readout-sm" style={{ color: 'var(--stage-text-secondary)' }}>
            Proposal: {currencyFmt.format(proposalTotal)}
          </p>
          {projectedMargin != null && (
            <p
              className="stage-readout-sm font-medium"
              style={{ color: marginPositive ? 'var(--color-unusonic-success)' : 'var(--color-unusonic-error)' }}
            >
              Margin: {currencyFmt.format(projectedMargin)}
              {marginPercent != null && ` (${marginPercent >= 0 ? '+' : ''}${marginPercent.toFixed(0)}%)`}
            </p>
          )}
        </div>
      )}

      {/* Missing rates warning */}
      {ratesMissing > 0 && (
        <div className="flex items-center gap-1.5 mt-2">
          <AlertTriangle size={12} className="shrink-0" style={{ color: 'var(--color-unusonic-warning)' }} aria-hidden />
          <p className="stage-badge-text" style={{ color: 'var(--color-unusonic-warning)' }}>
            {ratesMissing} of {assignedCount} rates missing
          </p>
        </div>
      )}
    </StagePanel>
  );
}

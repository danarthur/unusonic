'use client';

import { useState, useEffect } from 'react';
import { DollarSign, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import type { DealCrewRow } from '../actions/deal-crew';
import type { GearVarianceResult } from '../actions/get-gear-variance';

type FinancialSummaryCardProps = {
  crewRows: DealCrewRow[];
  proposalTotal: number | null;
  budgetEstimated: number | null;
  /** Actual spend from ledger (invoices + expenses + labor). Null if not yet fetched. */
  ledgerActual: number | null;
  /** Total revenue collected from invoices. */
  ledgerCollected: number | null;
  /**
   * Phase 5c of the proposal→gear lineage plan. Sold (proposal rental
   * subtotals) vs Planned (catalog target_cost × gear-card qty). Null while
   * fetching or when no proposal exists.
   */
  gearVariance: GearVarianceResult | null;
};

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

type Tier = {
  label: string;
  amount: number | null;
  sublabel?: string;
};

export function FinancialSummaryCard({
  crewRows,
  proposalTotal,
  budgetEstimated,
  ledgerActual,
  ledgerCollected,
  gearVariance,
}: FinancialSummaryCardProps) {
  // ── Labor computation ──
  const assigned = crewRows.filter((r) => r.entity_id);
  const totalLabor = assigned.reduce((sum, r) => sum + (r.day_rate ?? 0), 0);
  const ratesMissing = assigned.filter((r) => r.day_rate == null).length;

  // ── Margin: proposal minus labor ──
  const projectedMargin = proposalTotal != null && totalLabor > 0
    ? proposalTotal - totalLabor
    : null;
  const marginPercent = proposalTotal != null && proposalTotal > 0 && projectedMargin != null
    ? (projectedMargin / proposalTotal) * 100
    : null;

  // ── Budget delta ──
  const budgetDelta = budgetEstimated != null && proposalTotal != null
    ? ((proposalTotal - budgetEstimated) / budgetEstimated) * 100
    : null;

  // ── Tiers ──
  const tiers: Tier[] = [];

  if (budgetEstimated != null) {
    tiers.push({ label: 'Budget', amount: budgetEstimated, sublabel: 'estimated' });
  }

  if (proposalTotal != null) {
    tiers.push({ label: 'Quoted', amount: proposalTotal, sublabel: 'proposal' });
  }

  if (assigned.length > 0) {
    tiers.push({ label: 'Labor', amount: totalLabor, sublabel: `${assigned.length} crew` });
  }

  // Phase 5c: gear margin (sold vs planned). Shown only when the variance
  // action returned data — no proposal/no rental gear means no row.
  if (gearVariance?.hasData) {
    tiers.push({
      label: 'Gear',
      amount: gearVariance.sold,
      sublabel: `${currencyFmt.format(gearVariance.planned)} planned · ${gearVariance.margin >= 0 ? '+' : ''}${currencyFmt.format(gearVariance.margin)} margin`,
    });
  }

  if (ledgerActual != null) {
    tiers.push({ label: 'Actual', amount: ledgerActual, sublabel: 'total cost' });
  }

  // Don't render if nothing to show
  if (tiers.length === 0 && assigned.length === 0) return null;

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <DollarSign size={14} className="text-[var(--stage-text-tertiary)] shrink-0" aria-hidden />
        <span className="stage-label">Financials</span>
      </div>

      {/* Tiers */}
      {tiers.length > 0 && (
        <div className="flex flex-col gap-3">
          {tiers.map((tier) => (
            <div key={tier.label} className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="stage-field-label" style={{ color: 'var(--stage-text-secondary)' }}>
                  {tier.label}
                </span>
                {tier.sublabel && (
                  <span className="stage-badge-text" style={{ color: 'var(--stage-text-tertiary)' }}>
                    {tier.sublabel}
                  </span>
                )}
              </div>
              <span className="stage-readout shrink-0">
                {tier.amount != null ? currencyFmt.format(tier.amount) : '\u2014'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Divider before insights */}
      {(projectedMargin != null || budgetDelta != null || ledgerCollected != null) && (
        <div className="mt-3 pt-3 border-t border-[oklch(1_0_0_/_0.04)] flex flex-col gap-1.5">
          {/* Projected margin */}
          {projectedMargin != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="stage-field-label" style={{ color: 'var(--stage-text-tertiary)' }}>
                Projected margin
              </span>
              <span
                className="stage-readout-sm flex items-center gap-1"
                style={{ color: projectedMargin >= 0 ? 'var(--color-unusonic-success)' : 'var(--color-unusonic-error)' }}
              >
                {projectedMargin >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {currencyFmt.format(projectedMargin)}
                {marginPercent != null && ` (${marginPercent >= 0 ? '+' : ''}${marginPercent.toFixed(0)}%)`}
              </span>
            </div>
          )}

          {/* Budget variance */}
          {budgetDelta != null && (
            <div className="flex items-center justify-between gap-2">
              <span className="stage-field-label" style={{ color: 'var(--stage-text-tertiary)' }}>
                vs budget
              </span>
              <span
                className="stage-readout-sm"
                style={{ color: budgetDelta > 10 ? 'var(--color-unusonic-warning)' : budgetDelta <= 0 ? 'var(--color-unusonic-success)' : 'var(--stage-text-secondary)' }}
              >
                {budgetDelta > 0 ? '+' : ''}{budgetDelta.toFixed(0)}%
              </span>
            </div>
          )}

          {/* Collected */}
          {ledgerCollected != null && ledgerCollected > 0 && (
            <div className="flex items-center justify-between gap-2">
              <span className="stage-field-label" style={{ color: 'var(--stage-text-tertiary)' }}>
                Collected
              </span>
              <span className="stage-readout-sm" style={{ color: 'var(--color-unusonic-success)' }}>
                {currencyFmt.format(ledgerCollected)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Missing rates warning */}
      {ratesMissing > 0 && (
        <div className="flex items-center gap-1.5 mt-3">
          <AlertTriangle size={12} className="shrink-0" style={{ color: 'var(--color-unusonic-warning)' }} aria-hidden />
          <p className="stage-badge-text" style={{ color: 'var(--color-unusonic-warning)' }}>
            {ratesMissing} of {assigned.length} crew rates missing
          </p>
        </div>
      )}
    </StagePanel>
  );
}

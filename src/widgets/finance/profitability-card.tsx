'use client';

/**
 * Twin-Mirror Profitability Card – Liquid Ceramic
 * Left: Internal Budget | Center: Profit Margin % | Right: QBO Actuals
 * Pulse green if Actuals >= Budget; pulse red (glassmorphism warning) if Costs > Budget.
 */

import { motion } from 'framer-motion';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);
}

export interface ProfitabilityCardProps {
  /** Internal budget (estimates) */
  internalBudget: number;
  /** QBO actuals: sum(invoices) - sum(expenses) */
  qboActuals: number;
  /** QBO costs (expenses) for margin and warning */
  qboCosts?: number;
  className?: string;
}

export function ProfitabilityCard({
  internalBudget,
  qboActuals,
  qboCosts = 0,
  className,
}: ProfitabilityCardProps) {
  const marginPercent =
    qboActuals > 0 ? ((qboActuals - qboCosts) / qboActuals) * 100 : 0;
  const marginRounded = Number.isFinite(marginPercent) ? Math.round(marginPercent) : 0;
  const actualsAboveBudget = qboActuals >= internalBudget && internalBudget > 0;
  const costsOverBudget = qboCosts > internalBudget && internalBudget > 0;

  return (
    <StagePanel padding="none" className={`p-6 flex flex-col gap-4 border border-[oklch(1_0_0_/_0.10)] ${className ?? ''}`}>
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)]">
        Budget vs Actuals
      </h2>

      <div className="grid grid-cols-3 gap-4 items-center">
        {/* Left: Internal Budget */}
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
            Budget
          </p>
          <motion.p
            className="font-mono text-lg font-medium text-[var(--stage-text-primary)] tracking-tight"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={STAGE_MEDIUM}
          >
            {formatCurrency(internalBudget)}
          </motion.p>
        </div>

        {/* Center: Profit Margin */}
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
            Margin
          </p>
          <motion.span
            className={`inline-flex px-3 py-1.5 rounded-full text-sm font-medium ${
              actualsAboveBudget
                ? 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] border border-[var(--color-unusonic-success)]/25'
                : costsOverBudget
                  ? 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)] border border-[var(--color-unusonic-error)]/25'
                  : 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)] border border-[oklch(1_0_0_/_0.08)]'
            } ${actualsAboveBudget ? 'stage-skeleton' : ''} ${costsOverBudget ? 'stage-skeleton' : ''}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={STAGE_MEDIUM}
          >
            {marginRounded}%
          </motion.span>
        </div>

        {/* Right: QBO Actuals */}
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">
            Actuals
          </p>
          <motion.p
            className="font-mono text-lg font-medium text-[var(--stage-text-primary)] tracking-tight"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={STAGE_MEDIUM}
          >
            {formatCurrency(qboActuals)}
          </motion.p>
        </div>
      </div>

      {costsOverBudget && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-xl bg-[var(--color-unusonic-error)]/10 border border-[var(--color-unusonic-error)]/25 text-[var(--color-unusonic-error)] text-xs font-medium"
        >
          Costs exceed budget
        </motion.div>
      )}
    </StagePanel>
  );
}

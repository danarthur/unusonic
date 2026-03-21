'use client';

/**
 * Twin-Mirror Profitability Card – Liquid Ceramic
 * Left: Internal Budget | Center: Profit Margin % | Right: QBO Actuals
 * Pulse green if Actuals >= Budget; pulse red (glassmorphism warning) if Costs > Budget.
 */

import { motion } from 'framer-motion';
import { LiquidPanel } from '@/shared/ui/liquid-panel';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

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
    <LiquidPanel
      className={`liquid-card p-6 flex flex-col gap-4 border-mercury ${className ?? ''}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        Budget vs Actuals
      </h2>

      <div className="grid grid-cols-3 gap-4 items-center">
        {/* Left: Internal Budget */}
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted mb-1">
            Budget
          </p>
          <motion.p
            className="font-mono text-lg font-medium text-ink tracking-tight"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            {formatCurrency(internalBudget)}
          </motion.p>
        </div>

        {/* Center: Profit Margin */}
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted mb-1">
            Margin
          </p>
          <motion.span
            className={`inline-flex px-3 py-1.5 rounded-full text-sm font-medium ${
              actualsAboveBudget
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : costsOverBudget
                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                  : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
            } ${actualsAboveBudget ? 'animate-pulse' : ''} ${costsOverBudget ? 'animate-pulse' : ''}`}
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            transition={spring}
          >
            {marginRounded}%
          </motion.span>
        </div>

        {/* Right: QBO Actuals */}
        <div className="text-center">
          <p className="text-[10px] font-medium uppercase tracking-wider text-ink-muted mb-1">
            Actuals
          </p>
          <motion.p
            className="font-mono text-lg font-medium text-ink tracking-tight"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
          >
            {formatCurrency(qboActuals)}
          </motion.p>
        </div>
      </div>

      {costsOverBudget && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs font-medium"
        >
          Costs exceed budget
        </motion.div>
      )}
    </LiquidPanel>
  );
}

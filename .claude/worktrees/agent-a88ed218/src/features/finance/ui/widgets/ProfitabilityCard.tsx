/**
 * Profitability Card (The Margin Pulse) – Gross Profit, segmented bar (Cost | Profit), margin badge
 * Clean glass card. Badge: green if margin > 30%, yellow if &lt; 30%.
 * @module features/finance/ui/widgets/ProfitabilityCard
 */

'use client';

import { motion } from 'framer-motion';
import { formatCurrency } from '../../model/types';
import type { ProfitabilityDTO } from '../../model/types';
import type { FinancialSummaryDTO } from '../../model/types';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface ProfitabilityCardProps {
  profitability: ProfitabilityDTO;
  summary: FinancialSummaryDTO;
  className?: string;
}

export function ProfitabilityCard({
  profitability,
  summary,
  className,
}: ProfitabilityCardProps) {
  const { totalCost, grossProfit, marginPercent } = profitability;
  const { totalRevenue } = summary;
  const costShare = totalRevenue > 0 ? totalCost / totalRevenue : 0;
  const profitShare = totalRevenue > 0 ? grossProfit / totalRevenue : 0;
  const marginRounded = Number.isFinite(marginPercent) ? Math.round(marginPercent) : 0;
  const marginHealthy = marginRounded >= 30;

  return (
    <div
      className={`liquid-card p-6 flex flex-col gap-4 border-mercury ${className ?? ''}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        Gross Profit
      </h2>
      <div className="font-mono text-2xl font-medium text-ink tracking-tight">
        {formatCurrency(grossProfit)}
      </div>

      {/* Segmented progress bar: Cost (rose-100) | Profit (emerald-500) */}
      <div className="w-full h-3 rounded-full overflow-hidden bg-[var(--glass-border)] flex">
        <motion.div
          className="h-full bg-rose-100 dark:bg-rose-900/40"
          style={{ width: `${Math.min(100, costShare * 100)}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, costShare * 100)}%` }}
          transition={spring}
        />
        <motion.div
          className="h-full bg-emerald-500 dark:bg-emerald-600"
          style={{ width: `${Math.min(100, profitShare * 100)}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, profitShare * 100)}%` }}
          transition={spring}
        />
      </div>

      {/* Badge: green if > 30%, yellow if < 30% */}
      <div className="inline-flex items-center gap-2">
        <span
          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
            marginHealthy
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
          }`}
        >
          {marginRounded}% Margin
        </span>
      </div>
    </div>
  );
}

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
      className={`stage-panel p-6 flex flex-col gap-4 border-[oklch(1_0_0_/_0.08)] ${className ?? ''}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)]">
        Gross Profit
      </h2>
      <div className="font-mono text-2xl font-medium text-[var(--stage-text-primary)] tracking-tight">
        {formatCurrency(grossProfit)}
      </div>

      {/* Segmented progress bar: Cost (rose-100) | Profit (emerald-500) */}
      <div className="w-full h-3 rounded-full overflow-hidden bg-[oklch(1_0_0_/_0.08)] flex">
        <motion.div
          className="h-full bg-[oklch(0.35_0.08_20_/_0.25)]"
          style={{ width: `${Math.min(100, costShare * 100)}%` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, costShare * 100)}%` }}
          transition={spring}
        />
        <motion.div
          className="h-full bg-[var(--color-unusonic-success)]"
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
              ? 'bg-[oklch(0.45_0.08_145_/_0.25)] text-[var(--color-unusonic-success)]'
              : 'bg-[oklch(0.45_0.08_70_/_0.25)] text-[var(--color-unusonic-warning)]'
          }`}
        >
          {marginRounded}% Margin
        </span>
      </div>
    </div>
  );
}

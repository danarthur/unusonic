/**
 * Revenue Ring – Donut: Collected vs Outstanding. Center = outstanding (font-mono).
 * Colors: emerald (paid), stone (unpaid).
 * @module features/finance/ui/widgets/RevenueRing
 */

'use client';

import { motion } from 'framer-motion';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { formatCurrency } from '../../model/types';
import type { FinancialSummaryDTO } from '../../model/types';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface RevenueRingProps {
  summary: FinancialSummaryDTO;
  className?: string;
}

export function RevenueRing({ summary, className }: RevenueRingProps) {
  const { collected, outstanding, totalRevenue } = summary;
  const paidShare = totalRevenue > 0 ? collected / totalRevenue : 0;
  const unpaidShare = totalRevenue > 0 ? outstanding / totalRevenue : 0;

  const r = 80;
  const stroke = 24;
  const circumference = 2 * Math.PI * r;
  const paidLength = paidShare * circumference;
  const unpaidLength = unpaidShare * circumference;

  return (
    <LiquidPanel
      className={`flex flex-col items-center justify-center gap-4 ${className ?? ''}`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-muted">
        Revenue
      </h2>
      <div className="relative">
        <svg
          viewBox="0 0 200 200"
          className="w-48 h-48 -rotate-90"
          aria-hidden
        >
          <defs>
            <linearGradient id="revenue-paid" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(5, 150, 105)" />
              <stop offset="100%" stopColor="rgb(16, 185, 129)" />
            </linearGradient>
            <linearGradient id="revenue-unpaid" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgb(168, 162, 158)" />
              <stop offset="100%" stopColor="rgb(120, 113, 108)" />
            </linearGradient>
          </defs>
          <circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="var(--glass-border)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx="100"
            cy="100"
            r={r}
            fill="none"
            stroke="url(#revenue-paid)"
            strokeWidth={stroke}
            strokeDasharray={`${paidLength} ${circumference}`}
            strokeLinecap="round"
            initial={{ strokeDasharray: `0 ${circumference}` }}
            animate={{ strokeDasharray: `${paidLength} ${circumference}` }}
            transition={spring}
          />
          {unpaidShare > 0 && (
            <motion.circle
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke="url(#revenue-unpaid)"
              strokeWidth={stroke}
              strokeDasharray={`${unpaidLength} ${circumference}`}
              strokeDashoffset={-paidLength}
              strokeLinecap="round"
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{
                strokeDasharray: `${unpaidLength} ${circumference}`,
                opacity: outstanding > 0 ? [1, 0.82, 1] : 1,
              }}
              transition={{
                strokeDasharray: spring,
                opacity:
                  outstanding > 0
                    ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
                    : {},
              }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-2xl font-medium text-ink tracking-tight">
            {formatCurrency(outstanding)}
          </span>
        </div>
      </div>
      <p className="text-xs text-ink-muted font-medium">Outstanding</p>
    </LiquidPanel>
  );
}

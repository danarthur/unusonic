'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { formatCurrency } from '@/shared/lib/format-currency';
import {
  STAGE_MEDIUM,
  STAGE_STAGGER_CHILDREN,
} from '@/shared/lib/motion-constants';

// ── Types ───────────────────────────────────────────────────────────────────

export interface RevenueTrendData {
  months: { label: string; revenue: number }[];
}

interface RevenueTrendWidgetProps {
  data: RevenueTrendData;
  loading?: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────

export function RevenueTrendWidget({ data, loading = false }: RevenueTrendWidgetProps) {
  const { months } = data;
  const maxRevenue = Math.max(...months.map((m) => m.revenue), 1);
  const hasData = months.length > 0 && months.some((m) => m.revenue > 0);

  return (
    <WidgetShell
      icon={TrendingUp}
      label="Revenue Trend"
      loading={loading}
      empty={!hasData}
      emptyMessage="Not enough data yet"
      skeletonRows={4}
    >
      <div className="flex items-end gap-2 h-full pt-2 min-h-0">
        {months.map((month, i) => {
          const heightPct = (month.revenue / maxRevenue) * 100;

          return (
            <div key={month.label} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              {/* Value label — visible on the tallest bar, hover on others */}
              <span
                className="text-micro font-medium tabular-nums opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  color: 'var(--stage-text-secondary)',
                  opacity: month.revenue === maxRevenue ? 1 : undefined,
                }}
              >
                {month.revenue > 0 ? formatCurrency(month.revenue) : ''}
              </span>

              {/* Bar */}
              <motion.div
                className="w-full rounded-t-sm"
                style={{
                  background: 'var(--stage-accent, oklch(0.88 0 0))',
                  opacity: 0.3 + (heightPct / 100) * 0.7,
                  minHeight: month.revenue > 0 ? 4 : 0,
                }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(heightPct, month.revenue > 0 ? 4 : 0)}%` }}
                transition={{
                  ...STAGE_MEDIUM,
                  delay: i * STAGE_STAGGER_CHILDREN,
                }}
              />

              {/* Month label */}
              <span
                className="stage-micro shrink-0"
                style={{ color: 'var(--stage-text-secondary)' }}
              >
                {month.label}
              </span>
            </div>
          );
        })}
      </div>
    </WidgetShell>
  );
}

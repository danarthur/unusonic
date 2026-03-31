'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { PieChart } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { formatCurrency } from '@/shared/lib/format-currency';
import {
  STAGE_MEDIUM,
  STAGE_STAGGER_CHILDREN,
  M3_SHARED_AXIS_Y_VARIANTS,
} from '@/shared/lib/motion-constants';

// ── Types ───────────────────────────────────────────────────────────────────

export interface EventTypeDistData {
  types: { label: string; revenue: number; count: number }[];
}

interface EventTypeDistWidgetProps {
  data: EventTypeDistData;
  loading?: boolean;
}

const MAX_TYPES = 5;

// ── Component ───────────────────────────────────────────────────────────────

export function EventTypeDistWidget({ data, loading = false }: EventTypeDistWidgetProps) {
  const types = data.types.slice(0, MAX_TYPES);
  const maxRevenue = Math.max(...types.map((t) => t.revenue), 1);
  const hasData = types.length > 0;

  return (
    <WidgetShell
      icon={PieChart}
      label="Event Types"
      loading={loading}
      empty={!hasData}
      emptyMessage="No events yet"
      skeletonRows={3}
    >
      <div className="flex flex-col gap-2.5 h-full justify-evenly">
        {types.map((type, i) => {
          const widthPct = (type.revenue / maxRevenue) * 100;
          // Brightness varies per bar: top bar brightest
          const barOpacity = 0.4 + ((MAX_TYPES - i) / MAX_TYPES) * 0.6;

          return (
            <motion.div
              key={type.label}
              className="flex items-center gap-2"
              variants={M3_SHARED_AXIS_Y_VARIANTS}
              transition={{
                ...STAGE_MEDIUM,
                delay: i * STAGE_STAGGER_CHILDREN,
              }}
            >
              {/* Label */}
              <span
                className="text-[10px] font-medium truncate shrink-0 w-16"
                style={{ color: 'var(--stage-text-primary)' }}
              >
                {type.label}
              </span>

              {/* Bar track */}
              <div className="flex-1 h-4 relative rounded-sm overflow-hidden" style={{ background: 'var(--ctx-well, var(--stage-input-bg))' }}>
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-sm"
                  style={{
                    background: 'var(--stage-accent, oklch(0.88 0 0))',
                    opacity: barOpacity,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${widthPct}%` }}
                  transition={{
                    ...STAGE_MEDIUM,
                    delay: i * STAGE_STAGGER_CHILDREN,
                  }}
                />
              </div>

              {/* Value */}
              <span
                className="text-[10px] font-medium tabular-nums shrink-0 text-right w-12"
                style={{ color: 'var(--stage-text-secondary)' }}
              >
                {formatCurrency(type.revenue)}
              </span>
            </motion.div>
          );
        })}
      </div>
    </WidgetShell>
  );
}

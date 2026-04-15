'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, ArrowUp, ArrowDown, FileText, AlertTriangle } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { formatCurrency } from '@/shared/lib/format-currency';
import type { FinancialPulseDTO } from '@/widgets/dashboard/api';
import { METRICS } from '@/shared/lib/metrics/registry';

const META = METRICS['lobby.financial_pulse'];

// ── Helpers ────────────────────────────────────────────────────────────────

function formatCompactCurrency(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

/** Animated counter hook — counts from 0 to target over 600ms. */
function useAnimatedValue(target: number, durationMs = 600) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const animate = (now: number) => {
      if (target === 0) {
        setValue(0);
        return;
      }
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, durationMs]);

  return value;
}

// ── Component ──────────────────────────────────────────────────────────────

interface FinancialPulseWidgetProps {
  data?: FinancialPulseDTO;
  loading?: boolean;
}

export function FinancialPulseWidget({ data, loading }: FinancialPulseWidgetProps) {
  const animatedRevenue = useAnimatedValue(data?.revenueThisMonth ?? 0);
  const isEmpty = !data || (data.revenueThisMonth === 0 && data.outstandingCount === 0 && data.overdueCount === 0);

  return (
    <WidgetShell
      icon={DollarSign}
      label={META.title}
      href="/finance"
      hrefLabel="View finances"
      loading={loading}
      empty={isEmpty && !loading}
      emptyMessage={META.emptyState.body}
      skeletonRows={3}
    >
      {data && !isEmpty && (
        <div className="flex flex-col gap-4 h-full justify-between">
          {/* Primary: Revenue hero number */}
          <div>
            <motion.p
              className="stage-readout-hero"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={STAGE_LIGHT}
            >
              {formatCurrency(animatedRevenue / 100)}
            </motion.p>
            <p className="stage-label mt-1">Revenue this month</p>

            {/* Delta badge */}
            <motion.div
              className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...STAGE_LIGHT, delay: 0.1 }}
              style={
                data.revenueDelta > 0
                  ? { color: 'var(--color-unusonic-success)', background: 'var(--color-surface-success)' }
                  : data.revenueDelta < 0
                    ? { color: 'var(--color-unusonic-error)', background: 'var(--color-surface-error)' }
                    : { color: 'var(--stage-text-secondary)', background: 'oklch(1 0 0 / 0.04)' }
              }
            >
              {data.revenueDelta > 0 ? (
                <>
                  <ArrowUp className="w-3 h-3" strokeWidth={2} />
                  {data.revenueDelta}%
                </>
              ) : data.revenueDelta < 0 ? (
                <>
                  <ArrowDown className="w-3 h-3" strokeWidth={2} />
                  {Math.abs(data.revenueDelta)}%
                </>
              ) : (
                <span>&mdash;</span>
              )}
              {data.revenueDelta !== 0 && (
                <span className="opacity-60 ml-0.5">vs last month</span>
              )}
            </motion.div>
          </div>

          {/* Secondary metrics */}
          <div className="flex flex-col gap-2">
            {/* Outstanding */}
            {data.outstandingCount > 0 && (
              <div className="flex items-center gap-2">
                <FileText
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--stage-text-secondary)' }}
                  strokeWidth={1.5}
                />
                <span className="stage-readout-sm">
                  {data.outstandingCount} outstanding
                </span>
                <span className="stage-label">&middot;</span>
                <span className="stage-readout-sm">
                  {formatCompactCurrency(data.outstandingTotal)}
                </span>
              </div>
            )}

            {/* Overdue */}
            {data.overdueCount > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className="w-3.5 h-3.5 shrink-0"
                  style={{ color: 'var(--color-unusonic-error)' }}
                  strokeWidth={1.5}
                />
                <span className="stage-readout-sm" style={{ color: 'var(--color-unusonic-error)' }}>
                  {data.overdueCount} overdue
                </span>
                <span className="stage-label" style={{ color: 'var(--color-unusonic-error)' }}>&middot;</span>
                <span className="stage-readout-sm" style={{ color: 'var(--color-unusonic-error)' }}>
                  {formatCompactCurrency(data.overdueTotal)}
                </span>
              </div>
            )}

            {/* No outstanding or overdue — show clean state */}
            {data.outstandingCount === 0 && data.overdueCount === 0 && (
              <p className="text-xs" style={{ color: 'var(--stage-text-secondary)' }}>
                All proposals resolved.
              </p>
            )}
          </div>

        </div>
      )}
    </WidgetShell>
  );
}

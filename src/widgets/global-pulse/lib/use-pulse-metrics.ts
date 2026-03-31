'use client';

import { useState, useMemo } from 'react';
import { useFinanceData } from './use-finance-data';
import { useLobbyEvents } from './use-lobby-events';

export type PulseMetrics = {
  /** Current month revenue (from finance API or ledger). */
  revenueCents: number;
  /** Target revenue for the month (placeholder until targets exist). */
  targetCents: number;
  /** Active gig count in the next 72 hours. */
  activeGigsNext72h: number;
  /** High-sentiment inquiries or overdue contracts count. */
  alertsCount: number;
  loading: boolean;
  error: string | null;
};

const TARGET_PLACEHOLDER_CENTS = 30000_00; // $30k placeholder

/**
 * Pulse metrics for the 6-second strip and heartbeat state.
 * Derives from shared lobby events + shared finance data — no independent fetches.
 */
export function usePulseMetrics(): PulseMetrics & { isActiveMode: boolean } {
  const { data: financeRows, loading: financeLoading } = useFinanceData();
  const { events, loading: eventsLoading, error } = useLobbyEvents();

  const revenueCents = useMemo(() => {
    const total = financeRows.reduce(
      (acc: number, r) => acc + ((r.amount ?? r.total_amount ?? r.balance_due ?? 0) as number),
      0,
    );
    return Math.round(Number(total) * 100);
  }, [financeRows]);

  const [targetCents] = useState(TARGET_PLACEHOLDER_CENTS);

  const activeGigsNext72h = useMemo(() => {
    const now = Date.now();
    const in72h = now + 72 * 60 * 60 * 1000;
    return events.filter((e) => {
      if (!['confirmed', 'production', 'live'].includes(e.lifecycle_status)) return false;
      const t = new Date(e.starts_at).getTime();
      return t >= now && t <= in72h;
    }).length;
  }, [events]);

  const isActiveMode = activeGigsNext72h > 0;

  return {
    revenueCents,
    targetCents,
    activeGigsNext72h,
    alertsCount: 0,
    loading: eventsLoading || financeLoading,
    error,
    isActiveMode,
  };
}

/**
 * Health Index 0–100 for mobile collapse. Derived from velocity ratio, pulse, and alerts.
 */
export function useHealthIndex(metrics: PulseMetrics): number {
  return useMemo(() => {
    if (metrics.loading) return 50;
    const velocityRatio = metrics.targetCents > 0 ? metrics.revenueCents / metrics.targetCents : 0;
    const velocityScore = Math.min(1, velocityRatio) * 40;
    const pulseScore = metrics.activeGigsNext72h > 0 ? 30 : 20;
    const alertPenalty = Math.min(30, metrics.alertsCount * 10);
    return Math.round(Math.max(0, Math.min(100, velocityScore + pulseScore - alertPenalty + 30)));
  }, [metrics]);
}

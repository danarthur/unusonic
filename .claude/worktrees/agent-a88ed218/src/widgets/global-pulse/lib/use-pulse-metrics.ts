'use client';

import { useEffect, useState, useMemo } from 'react';
import { createClient } from '@/shared/api/supabase/client';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';

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
 * Fetches pulse metrics for the 6-second strip and derives heartbeat state.
 * - Velocity: revenue vs target (from finance ledger or placeholder).
 * - Pulse: events with starts_at in [now, now+72h].
 * - Alerts: overdue count (placeholder; can later use invoices past due or sentiment).
 */
export function usePulseMetrics(): PulseMetrics & { isActiveMode: boolean } {
  const { workspaceId } = useWorkspace();
  const supabase = useMemo(() => createClient(), []);
  const [revenueCents, setRevenueCents] = useState(0);
  const [targetCents] = useState(TARGET_PLACEHOLDER_CENTS);
  const [activeGigsNext72h, setActiveGigsNext72h] = useState(0);
  const [alertsCount, setAlertsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function run() {
      setLoading(true);
      setError(null);

      const now = new Date();
      const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000);
      const isoNow = now.toISOString();
      const iso72h = in72h.toISOString();

      try {
        // Events in next 72h (confirmed, production, live)
        let query = supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .in('lifecycle_status', ['confirmed', 'production', 'live'])
          .gte('starts_at', isoNow)
          .lte('starts_at', iso72h);

        if (workspaceId) query = query.eq('workspace_id', workspaceId);

        const { count: gigCount, error: eventsError } = await query;

        if (!active) return;
        if (eventsError) {
          console.warn('[Pulse] events error:', eventsError.message);
          setActiveGigsNext72h(0);
        } else {
          setActiveGigsNext72h(typeof gigCount === 'number' ? gigCount : 0);
        }

        // Revenue: fetch finance API for current month total (simplified: sum first 5 from ledger as proxy)
        const res = await fetch('/api/finance', { cache: 'no-store' });
        const financeRows = res.ok ? await res.json() : [];
        const total = Array.isArray(financeRows)
          ? financeRows.reduce(
              (acc: number, r: { amount?: number; total_amount?: number; balance_due?: number }) =>
                acc + (r.amount ?? r.total_amount ?? r.balance_due ?? 0),
              0
            )
          : 0;
        setRevenueCents(Math.round(Number(total) * 100));

        // Alerts: placeholder (overdue contracts / high-sentiment — no table yet)
        setAlertsCount(0);
      } catch (e) {
        if (active) {
          console.error('[Pulse]', e);
          setError('Unable to load pulse');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    run();
    return () => {
      active = false;
    };
  }, [supabase, workspaceId]);

  const isActiveMode = activeGigsNext72h > 0;

  return {
    revenueCents,
    targetCents,
    activeGigsNext72h,
    alertsCount,
    loading,
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

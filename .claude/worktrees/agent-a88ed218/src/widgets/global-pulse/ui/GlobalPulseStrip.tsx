'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp, Radio, AlertCircle, Shield } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { usePulseMetrics, useHealthIndex } from '../lib/use-pulse-metrics';
import { useRecoveryNeeded } from '@/features/sovereign-recovery/lib/use-recovery-needed';
import { M3_FADE_THROUGH_ENTER } from '@/shared/lib/motion-constants';
import { Sparkline, MiniBarStrip } from './Sparkline';

/**
 * 6-Second Pulse Layer — thin Liquid Glass bar above the Bento (fixed at top; lobby keeps it outside scroll).
 * Desktop: Velocity | Pulse | Alerts. Mobile: Health Index %.
 * Recovery: Shield icon with red dot when backup needed; click opens compact CTA.
 */
export function GlobalPulseStrip() {
  const metrics = usePulseMetrics();
  const healthIndex = useHealthIndex(metrics);
  const { recoveryNeeded, dismiss } = useRecoveryNeeded();
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  const revenueFormatted =
    metrics.revenueCents >= 0
      ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
          metrics.revenueCents / 100
        )
      : '—';
  const targetFormatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    metrics.targetCents / 100
  );

  /* Stub sparkline data: revenue trend up, next-7-days event load (replace with real data when available). */
  const velocitySparkline = useMemo(() => [0.2, 0.35, 0.5, 0.6, 0.7, 0.85, 1], []);
  const pulseBars = useMemo(
    () => [0, 0, 1, 0, 1, 1, Math.min(metrics.activeGigsNext72h, 5)] as number[],
    [metrics.activeGigsNext72h]
  );

  if (metrics.loading) {
    return (
      <motion.div
        className="liquid-card-pulse px-4 py-3 md:px-6 md:py-3 flex items-center justify-between gap-4"
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={M3_FADE_THROUGH_ENTER}
      >
        <div className="h-5 w-24 liquid-card-nested animate-pulse !rounded-lg" />
        <div className="md:flex gap-6 hidden">
          <div className="h-5 w-16 liquid-card-nested animate-pulse !rounded-lg" />
          <div className="h-5 w-16 liquid-card-nested animate-pulse !rounded-lg" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="liquid-card-pulse px-4 py-3 md:px-6 md:py-3 flex items-center justify-between gap-4"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={M3_FADE_THROUGH_ENTER}
      aria-label="Business health at a glance"
    >
      {/* Mobile: single Health Index */}
      <div className="md:hidden flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Health</span>
        <span className="text-lg font-medium text-ceramic tracking-tight tabular-nums">
          {healthIndex}%
        </span>
      </div>

      {/* Desktop: Velocity | Pulse | Alerts */}
      <div className="hidden md:flex items-center gap-6 flex-1">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center gap-2">
            <Sparkline values={velocitySparkline} stroke="var(--color-neon-blue)" opacity={0.5} className="shrink-0" />
            <div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Velocity</span>
              <span className="text-sm font-medium text-ceramic tracking-tight tabular-nums block">
                {revenueFormatted}
                <span className="text-muted font-normal"> / {targetFormatted}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center gap-2">
            <MiniBarStrip values={pulseBars} fill="var(--color-neon-blue)" opacity={0.5} className="shrink-0" />
            <div>
              <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Pulse</span>
              <span className="text-sm font-medium text-ceramic tracking-tight tabular-nums block">
                {metrics.activeGigsNext72h} <span className="text-muted font-normal">next 72h</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-muted shrink-0" aria-hidden />
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted">Alerts</span>
          <span className="text-sm font-medium text-ceramic tracking-tight tabular-nums">
            {metrics.alertsCount}
          </span>
        </div>
      </div>

      {metrics.error && (
        <span className="text-xs text-muted shrink-0" role="status">
          {metrics.error}
        </span>
      )}

      {/* Recovery: Shield icon with red dot when backup needed */}
      {recoveryNeeded && (
        <Popover open={recoveryOpen} onOpenChange={setRecoveryOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="m3-btn-icon relative shrink-0"
              aria-label="Account recovery needed"
            >
              <Shield className="w-4 h-4" />
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-signal-error" aria-hidden />
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            className="liquid-card m3-card-corner-extra-large p-4 max-w-[280px] border-[var(--glass-border)]"
            sideOffset={8}
          >
            <p className="text-sm font-medium text-ceramic">Back up your account</p>
            <p className="text-xs text-muted leading-relaxed mt-1">
              Set up a recovery kit so you never get locked out.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link
                href="/settings/security"
                onClick={() => setRecoveryOpen(false)}
                className="m3-btn-tonal px-4 py-2 text-sm"
              >
                Back up now
              </Link>
              <button
                type="button"
                onClick={() => {
                  dismiss();
                  setRecoveryOpen(false);
                }}
                className="m3-btn-text px-4 py-2 text-sm"
              >
                Remind me later
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </motion.div>
  );
}

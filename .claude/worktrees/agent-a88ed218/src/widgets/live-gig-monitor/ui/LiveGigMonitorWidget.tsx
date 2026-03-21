'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Radio, ArrowUpRight, Cloud, Users } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { useNextGig, minutesUntil, formatCountdown } from '../lib/use-next-gig';
import {
  M3_FADE_THROUGH_ENTER,
  M3_SHARED_AXIS_Y_VARIANTS,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

interface LiveGigMonitorWidgetProps {
  /** Levitation: floats above grid (scale, deeper shadow) for medium/critical urgency */
  levitate?: boolean;
}

/**
 * State B hero: Live Gig Monitor — countdown, Run-of-Show link, crew check-in (stub).
 */
export function LiveGigMonitorWidget({ levitate = false }: LiveGigMonitorWidgetProps) {
  const { gig, loading, error } = useNextGig();
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!gig?.starts_at) {
      setCountdown(null);
      return;
    }
    const tick = () => setCountdown(minutesUntil(gig.starts_at));
    tick();
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [gig?.starts_at]);

  if (loading) {
    return (
      <LiquidPanel hoverEffect levitate={levitate} className="h-full min-h-[280px] flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight">
            Live Gig Monitor
          </h2>
        </div>
        <div className="flex-1 flex flex-col gap-4 justify-center">
          <div className="h-12 liquid-card-nested animate-pulse rounded-xl" />
          <div className="h-8 liquid-card-nested animate-pulse rounded-xl w-2/3" />
        </div>
      </LiquidPanel>
    );
  }

  if (error || !gig) {
    return (
      <LiquidPanel hoverEffect levitate={levitate} className="h-full min-h-[280px] flex flex-col justify-between">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight">
            Live Gig Monitor
          </h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
          <Radio className="w-10 h-10 text-muted mb-3" />
          <p className="text-sm text-muted leading-relaxed">
            No gigs in the next 72 hours
          </p>
          <Link href="/crm" className="mt-4 text-xs font-medium text-neon hover:underline">
            View Production Queue
          </Link>
        </div>
      </LiquidPanel>
    );
  }

  const countdownLabel = countdown !== null ? formatCountdown(countdown) : '—';

  return (
    <LiquidPanel hoverEffect levitate={levitate} className="h-full min-h-[280px] flex flex-col justify-between">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight">
          Live Gig Monitor
        </h2>
        <Link href={`/crm/${gig.id}`} className="text-muted hover:text-ceramic transition-colors" aria-label="Run of Show">
          <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      <motion.div
        className="flex-1 flex flex-col justify-center space-y-4"
        initial="hidden"
        animate="visible"
        variants={{
          visible: {
            transition: {
              staggerChildren: M3_STAGGER_CHILDREN,
              delayChildren: M3_STAGGER_DELAY,
            },
          },
          hidden: {},
        }}
      >
        {/* Countdown — large, tracking-tighter (reality anchor) */}
        <motion.div
          variants={M3_SHARED_AXIS_Y_VARIANTS}
          transition={M3_FADE_THROUGH_ENTER}
          className="liquid-card-nested p-4 flex flex-col gap-1"
        >
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted">
            Countdown
          </span>
          <span className="text-3xl font-medium text-ceramic tracking-tighter tabular-nums leading-none">
            {countdownLabel}
          </span>
        </motion.div>
        <motion.div
          variants={M3_SHARED_AXIS_Y_VARIANTS}
          transition={M3_FADE_THROUGH_ENTER}
        >
          <span className="text-sm font-medium text-ceramic tracking-tight block">
            {gig.title ?? 'Untitled'}
          </span>
        </motion.div>
        {/* Weather / Location pill — environmental context (reality anchor) */}
        <motion.div
          variants={M3_SHARED_AXIS_Y_VARIANTS}
          transition={M3_FADE_THROUGH_ENTER}
          className="flex flex-wrap gap-2"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] px-3 py-1.5 liquid-card-nested !rounded-full">
            <Cloud className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden />
            <span className="text-xs font-medium text-ceramic tracking-tight">Clear, 72°F</span>
          </span>
          {gig.location_name && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] px-3 py-1.5 liquid-card-nested !rounded-full">
              <span className="text-xs font-medium text-muted tracking-tight">{gig.location_name}</span>
            </span>
          )}
        </motion.div>
        {/* Traffic light — crew arrival: Green = On time, Red = Delays */}
        <motion.div
          variants={M3_SHARED_AXIS_Y_VARIANTS}
          transition={M3_FADE_THROUGH_ENTER}
          className="flex items-center gap-2"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-signal-success/50 bg-signal-success/20 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-ceramic">
            <span className="h-1.5 w-1.5 rounded-full bg-signal-success" aria-hidden />
            On time
          </span>
          <span className="text-[10px] text-muted">Crew arrival</span>
        </motion.div>
        {/* Crew Status — per-role detail */}
        <motion.div
          variants={M3_SHARED_AXIS_Y_VARIANTS}
          transition={M3_FADE_THROUGH_ENTER}
          className="space-y-2"
        >
          <span className="text-[10px] font-medium uppercase tracking-widest text-muted flex items-center gap-2">
            <Users className="w-3.5 h-3.5" aria-hidden />
            Crew Status
          </span>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">DJ</span>
              <span className="text-ceramic font-medium flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-signal-success" aria-hidden />
                Checked In
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Lighting</span>
              <span className="text-muted font-medium flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-signal-warning animate-pulse" aria-hidden />
                En Route
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <div className="flex gap-2 mt-4">
        <Link href={`/crm/${gig.id}`} className="flex-1">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={M3_FADE_THROUGH_ENTER}
            className="w-full m3-btn-outlined text-[10px] uppercase tracking-wider"
          >
            Run of Show
          </motion.button>
        </Link>
        <Link href={`/events/${gig.id}`} className="flex-1">
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={M3_FADE_THROUGH_ENTER}
            className="w-full m3-btn-outlined text-[10px] uppercase tracking-wider"
          >
            Event
          </motion.button>
        </Link>
      </div>
    </LiquidPanel>
  );
}

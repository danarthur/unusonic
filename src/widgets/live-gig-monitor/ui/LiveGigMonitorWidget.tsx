'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { Radio, Cloud, Users } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared';
import { useNextGig, minutesUntil, formatCountdown } from '../lib/use-next-gig';
import {
  STAGE_LIGHT,
} from '@/shared/lib/motion-constants';

interface LiveGigMonitorWidgetProps {
  /** Levitation: floats above grid (scale, deeper shadow) for medium/critical urgency */
  levitate?: boolean;
}

/**
 * State B hero: Live Gig Monitor — countdown, Run-of-Show link, crew check-in (stub).
 */
// levitate reserved for future urgency presentation
export function LiveGigMonitorWidget({ levitate: _levitate = false }: LiveGigMonitorWidgetProps) {
  void _levitate;
  const { gig, loading, error } = useNextGig();
  const [countdown, setCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!gig?.starts_at) {
      queueMicrotask(() => setCountdown(null));
      return;
    }
    const tick = () => setCountdown(minutesUntil(gig.starts_at));
    queueMicrotask(tick);
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [gig?.starts_at]);

  const countdownLabel = countdown !== null ? formatCountdown(countdown) : '—';

  return (
    <WidgetShell
      icon={Radio}
      label="Live Gig Monitor"
      href={gig ? `/crm/${gig.id}` : undefined}
      hrefLabel="View gig"
      loading={loading}
      skeletonRows={2}
      empty={!loading && (!!error || !gig)}
      emptyMessage="No gigs in the next 72 hours"
      className="min-h-[280px]"
    >
      {!gig ? null : <motion.div
        className="flex-1 flex flex-col justify-center space-y-4"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.03 } },
          hidden: {},
        }}
      >
        {/* Countdown — large, tracking-tighter (reality anchor) */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={STAGE_LIGHT}
          className="stage-panel-nested p-4 flex flex-col gap-1"
        >
          <span className="stage-label">
            Countdown
          </span>
          <span className="text-3xl font-medium text-[var(--stage-text-primary)] tracking-tighter tabular-nums leading-none">
            {countdownLabel}
          </span>
        </motion.div>
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={STAGE_LIGHT}
        >
          <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight block">
            {gig.title ?? 'Untitled'}
          </span>
        </motion.div>
        {/* Weather / Location pill — environmental context (reality anchor) */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={STAGE_LIGHT}
          className="flex flex-wrap gap-2"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[oklch(1_0_0_/_0.08)] px-3 py-1.5 stage-panel-nested !rounded-full">
            <Cloud className="w-3.5 h-3.5 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
            <span className="text-xs font-medium text-[var(--stage-text-primary)] tracking-tight">Clear, 72°F</span>
          </span>
          {gig.location_name && (
            <span className="inline-flex items-center gap-2 rounded-full border border-[oklch(1_0_0_/_0.08)] px-3 py-1.5 stage-panel-nested !rounded-full">
              <span className="text-xs font-medium text-[var(--stage-text-secondary)] tracking-tight">{gig.location_name}</span>
            </span>
          )}
        </motion.div>
        {/* Traffic light — crew arrival: Green = On time, Red = Delays */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={STAGE_LIGHT}
          className="flex items-center gap-2"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-unusonic-success)]/50 bg-[var(--color-unusonic-success)]/20 px-2.5 py-1 stage-label text-[var(--stage-text-primary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-unusonic-success)]" aria-hidden />
            On time
          </span>
          <span className="text-label text-[var(--stage-text-secondary)]">Crew arrival</span>
        </motion.div>
        {/* Crew Status — per-role detail */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          transition={STAGE_LIGHT}
          className="space-y-2"
        >
          <span className="stage-label flex items-center gap-2">
            <Users className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
            Crew Status
          </span>
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--stage-text-secondary)]">DJ</span>
              <span className="text-[var(--stage-text-primary)] font-medium flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-unusonic-success)]" aria-hidden />
                Checked In
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--stage-text-secondary)]">Lighting</span>
              <span className="text-[var(--stage-text-secondary)] font-medium flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-unusonic-warning)]" aria-hidden />
                En Route
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>}

      {gig && (
        <div className="flex gap-2 mt-4">
          <Link
            href={`/crm/${gig.id}`}
            className={cn(
              'flex-1 inline-flex items-center justify-center w-full m3-btn-outlined stage-label',
              'transition-colors hover:bg-[oklch(1_0_0_/_0.08)]'
            )}
          >
            Run of Show
          </Link>
          <Link
            href={`/events/${gig.id}`}
            className={cn(
              'flex-1 inline-flex items-center justify-center w-full m3-btn-outlined stage-label',
              'transition-colors hover:bg-[oklch(1_0_0_/_0.08)]'
            )}
          >
            Event
          </Link>
        </div>
      )}
    </WidgetShell>
  );
}

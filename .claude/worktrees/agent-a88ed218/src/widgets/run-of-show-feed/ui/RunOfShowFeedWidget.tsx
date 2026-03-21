'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ListOrdered, Circle, CircleDot } from 'lucide-react';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { useRosFeed, isCueNow, isCueUpcoming, isCuePast, type CueRow } from '../lib/use-ros-feed';
import {
  M3_FADE_THROUGH_ENTER,
  M3_SHARED_AXIS_X_VARIANTS,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';

/**
 * State B Primary Action: Run-of-Show Feed — timeline of what should be happening now vs. what is happening.
 */
export function RunOfShowFeedWidget() {
  const { cues, loading, eventId } = useRosFeed();

  return (
    <LiquidPanel className="h-full flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <h2 className="text-xs font-medium text-muted uppercase tracking-widest tracking-tight">
          Run-of-Show Feed
        </h2>
        {eventId && (
          <Link
            href={`/crm/${eventId}`}
            className="m3-btn-text !min-h-0 !px-3 py-1.5 text-[10px] uppercase tracking-wider"
          >
            Full RoS
          </Link>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 liquid-card-nested animate-pulse rounded-xl" />
            ))}
          </div>
        ) : cues.length === 0 ? (
          <p className="text-xs text-muted leading-relaxed py-4">
            No cues yet. Add run-of-show for the upcoming gig.
          </p>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
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
            {cues.map((cue) => (
              <CueRowItem key={cue.id} cue={cue} />
            ))}
          </motion.div>
        )}
      </div>
    </LiquidPanel>
  );
}

function CueRowItem({ cue }: { cue: CueRow }) {
  const now = isCueNow(cue);
  const upcoming = isCueUpcoming(cue);
  const past = isCuePast(cue);

  return (
    <motion.div
      variants={M3_SHARED_AXIS_X_VARIANTS}
      transition={M3_FADE_THROUGH_ENTER}
      className={`liquid-card-nested p-3 rounded-xl flex items-center gap-3 ${
        now ? 'border-neon/30 bg-neon/5' : ''
      }`}
    >
      <span className="shrink-0 text-muted">
        {now ? (
          <CircleDot className="w-4 h-4 text-neon" aria-hidden />
        ) : (
          <Circle className="w-4 h-4" aria-hidden />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-ceramic tracking-tight block truncate">
          {cue.title}
        </span>
        {cue.start_time && (
          <span className="text-[10px] text-muted">
            {new Date(cue.start_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {cue.duration_minutes != null && ` · ${cue.duration_minutes}m`}
          </span>
        )}
      </div>
      {now && (
        <span className="text-[10px] font-medium uppercase tracking-wider text-neon shrink-0">
          Now
        </span>
      )}
      {upcoming && !now && (
        <span className="text-[10px] text-muted shrink-0">Up next</span>
      )}
      {past && (
        <span className="text-[10px] text-muted shrink-0">Done</span>
      )}
    </motion.div>
  );
}

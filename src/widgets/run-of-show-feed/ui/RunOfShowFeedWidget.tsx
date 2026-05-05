'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Circle, CircleDot } from 'lucide-react';
import { RunOfShow } from '@/shared/ui/icons';
import { WidgetShell } from '@/widgets/shared';
import { useRosFeed, isCueNow, isCueUpcoming, isCuePast, type CueRow } from '../lib/use-ros-feed';
import {
  STAGE_LIGHT,
} from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';

const META = METRICS['lobby.run_of_show_feed'];

/**
 * State B Primary Action: Run-of-Show Feed — timeline of what should be happening now vs. what is happening.
 */
export function RunOfShowFeedWidget() {
  const { cues, loading, eventId } = useRosFeed();

  return (
    <WidgetShell
      icon={RunOfShow}
      label={META.title}
      href={eventId ? `/events/${eventId}/run-of-show` : undefined}
      hrefLabel="Full run of show"
      loading={loading}
      skeletonRows={3}
      empty={!loading && cues.length === 0}
      emptyMessage={META.emptyState.body}
    >
      <motion.div
        className="flex flex-col gap-2 overflow-y-auto"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.03 } },
          hidden: {},
        }}
      >
        {cues.map((cue) => (
          <CueRowItem key={cue.id} cue={cue} />
        ))}
      </motion.div>
    </WidgetShell>
  );
}

function CueRowItem({ cue }: { cue: CueRow }) {
  const now = isCueNow(cue);
  const upcoming = isCueUpcoming(cue);
  const past = isCuePast(cue);

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }}
      transition={STAGE_LIGHT}
      className={`p-3 rounded-xl flex items-center gap-3 border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)] ${
        now ? 'border-[oklch(1_0_0_/_0.14)] bg-[oklch(1_0_0_/_0.04)]' : ''
      }`}
    >
      <span className="shrink-0 text-[var(--stage-text-secondary)]">
        {now ? (
          <CircleDot className="w-4 h-4 text-[var(--stage-accent)]" strokeWidth={1.5} aria-hidden />
        ) : (
          <Circle className="w-4 h-4" strokeWidth={1.5} aria-hidden />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight block truncate">
          {cue.title}
        </span>
        {cue.start_time && (
          <span className="text-label text-[var(--stage-text-secondary)]">
            {new Date(cue.start_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
            {cue.duration_minutes != null && ` · ${cue.duration_minutes}m`}
          </span>
        )}
      </div>
      {now && (
        <span className="stage-label text-[var(--stage-accent)] shrink-0">
          Now
        </span>
      )}
      {upcoming && !now && (
        <span className="text-label text-[var(--stage-text-secondary)] shrink-0">Up next</span>
      )}
      {past && (
        <span className="text-label text-[var(--stage-text-secondary)] shrink-0">Done</span>
      )}
    </motion.div>
  );
}

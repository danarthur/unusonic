'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import type { TodayScheduleResult, TodayEvent } from '@/widgets/dashboard/api';
import {
  STAGE_LIGHT,
} from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';

const META = METRICS['lobby.today_schedule'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatCountdown(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'soon';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `in ${days}d ${hours}h`;
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${mins}m`;
}

const statusColors: Record<string, string> = {
  confirmed: 'var(--color-unusonic-info)',
  production: 'var(--color-unusonic-warning)',
  live: 'var(--color-unusonic-success)',
};

// ── Event Row ────────────────────────────────────────────────────────────────

function EventRow({ event }: { event: TodayEvent }) {
  const location = event.venueName ?? event.locationName;

  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }} transition={STAGE_LIGHT}>
      <Link
        href={`/events/${event.id}`}
        className="flex items-center gap-3 px-3 py-2.5 -mx-3 rounded-[var(--stage-radius-input)] hover:bg-[var(--ctx-well-hover)] transition-colors"
      >
        {/* Time */}
        <span className="shrink-0 w-16 text-xs font-medium tabular-nums" style={{ color: 'var(--stage-text-secondary)' }}>
          {formatTime(event.startsAt)}
        </span>

        {/* Title + location */}
        <div className="flex-1 min-w-0">
          <p className="stage-readout-sm truncate">{event.title}</p>
          {location && (
            <p className="stage-label flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="w-3 h-3 shrink-0" strokeWidth={1.5} />
              {location}
            </p>
          )}
        </div>

        {/* Crew count */}
        {event.crewFilled > 0 && (
          <span className="shrink-0 flex items-center gap-1 text-xs" style={{ color: 'var(--stage-text-secondary)' }}>
            <Users className="w-3 h-3" strokeWidth={1.5} />
            {event.crewFilled}
          </span>
        )}

        {/* Status pill */}
        <span
          className="shrink-0 px-2 py-0.5 rounded-full stage-label"
          style={{
            color: statusColors[event.lifecycleStatus] ?? 'var(--stage-text-secondary)',
            background: 'var(--ctx-well, oklch(1 0 0 / 0.04))',
          }}
        >
          {event.lifecycleStatus}
        </span>
      </Link>
    </motion.div>
  );
}

// ── Next Up ──────────────────────────────────────────────────────────────────

function NextUpBlock({ event }: { event: NonNullable<TodayScheduleResult['nextEvent']> }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
      transition={STAGE_LIGHT}
      className="flex flex-col items-center justify-center text-center gap-2 py-3"
    >
      <Clock className="w-6 h-6" style={{ color: 'var(--stage-text-secondary)', opacity: 0.4 }} strokeWidth={1} />
      <p className="stage-label">Next up</p>
      <p className="stage-readout-sm">{event.title}</p>
      {event.venueName && (
        <p className="stage-label flex items-center gap-1">
          <MapPin className="w-3 h-3" strokeWidth={1.5} />
          {event.venueName}
        </p>
      )}
      <p className="text-sm font-medium" style={{ color: 'var(--stage-accent)' }}>
        {formatCountdown(event.startsAt)}
      </p>
    </motion.div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────

interface TodayScheduleWidgetProps {
  data: TodayScheduleResult;
  loading?: boolean;
}

export function TodayScheduleWidget({ data, loading }: TodayScheduleWidgetProps) {
  const hasEvents = data.events.length > 0;
  const hasNextUp = !hasEvents && data.nextEvent !== null;
  const empty = !hasEvents && !hasNextUp;

  return (
    <WidgetShell
      icon={Calendar}
      label={META.title}
      href="/calendar"
      loading={loading}
      empty={!loading && empty}
      emptyMessage={META.emptyState.body}
    >
      {hasEvents && (
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0 overflow-y-auto">
            {data.events.map((evt) => (
              <EventRow key={evt.id} event={evt} />
            ))}
          </div>
        </div>
      )}
      {hasNextUp && data.nextEvent && (
        <div className="flex flex-col h-full items-center justify-center">
          <NextUpBlock event={data.nextEvent} />
        </div>
      )}
    </WidgetShell>
  );
}

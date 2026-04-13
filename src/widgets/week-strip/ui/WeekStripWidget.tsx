'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import type { WeekDay } from '@/widgets/dashboard/api';
import {
  STAGE_LIGHT,
} from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

// ── Day Cell ─────────────────────────────────────────────────────────────────

function DayCell({ day }: { day: WeekDay }) {
  const dateNum = new Date(day.date + 'T00:00:00Z').getUTCDate();
  const eventCount = day.events.length;

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, x: -8 }, visible: { opacity: 1, x: 0 } }}
      transition={STAGE_LIGHT}
      className={cn(
        'flex flex-col items-center gap-1.5 py-3 px-2 rounded-[var(--stage-radius-input)] flex-1 min-w-0 transition-colors',
        day.isToday
          ? 'bg-[var(--ctx-card)]'
          : 'bg-transparent',
      )}
    >
      {/* Day label */}
      <span
        className={cn(
          'stage-label',
          day.isToday
            ? 'text-[var(--stage-accent)]'
            : 'text-[var(--stage-text-secondary)]',
        )}
      >
        {day.dayLabel}
      </span>

      {/* Date number */}
      <span
        className={cn(
          'text-sm font-medium tabular-nums',
          day.isToday
            ? 'text-[var(--stage-text-primary)]'
            : 'text-[var(--stage-text-secondary)]',
        )}
      >
        {dateNum}
      </span>

      {/* Event indicator */}
      {eventCount > 0 ? (
        <span
          className="flex items-center justify-center w-5 h-5 rounded-full stage-badge-text"
          style={{
            background: day.hasIssues
              ? 'var(--color-unusonic-warning)'
              : 'var(--stage-accent)',
            color: 'var(--stage-void)',
          }}
        >
          {eventCount}
        </span>
      ) : (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--stage-edge-subtle, oklch(1 0 0 / 0.1))' }}
        />
      )}

      {/* Issue dot */}
      {day.hasIssues && eventCount > 0 && (
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: 'var(--color-unusonic-warning)' }}
        />
      )}
    </motion.div>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────

interface WeekStripWidgetProps {
  data: WeekDay[];
  loading?: boolean;
}

export function WeekStripWidget({ data, loading }: WeekStripWidgetProps) {
  return (
    <WidgetShell
      icon={CalendarDays}
      label="This Week"
      href="/calendar"
      loading={loading}
      empty={data.length === 0}
      emptyMessage="No week data available"
      skeletonRows={2}
    >
      <div className="flex gap-1 overflow-x-auto h-full items-center">
        {data.map((day) => (
          <DayCell key={day.date} day={day} />
        ))}
      </div>
    </WidgetShell>
  );
}

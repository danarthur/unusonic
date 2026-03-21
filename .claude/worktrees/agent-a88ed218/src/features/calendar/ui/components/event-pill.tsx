'use client';

import { format } from 'date-fns';
import type { CalendarEvent, CalendarEventColor } from '@/features/calendar/model/types';

/** Border + bg tint only; text uses semantic tokens for visibility on dark theme. */
const COLOR_CLASSES: Record<CalendarEventColor, string> = {
  emerald:
    'bg-emerald-500/25 border border-emerald-500/40 dark:bg-emerald-500/30 dark:border-emerald-400/50',
  amber:
    'bg-amber-500/25 border border-amber-500/40 dark:bg-amber-500/30 dark:border-amber-400/50',
  rose:
    'bg-rose-500/25 border border-rose-500/40 dark:bg-rose-500/30 dark:border-rose-400/50',
  blue:
    'bg-blue-500/25 border border-blue-500/40 dark:bg-blue-500/30 dark:border-blue-400/50',
};

/** Time range: earliest to latest. */
function timeRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (start <= end) {
    return `${format(new Date(startIso), 'h:mm a')} – ${format(new Date(endIso), 'h:mm a')}`;
  }
  return `${format(new Date(endIso), 'h:mm a')} – ${format(new Date(startIso), 'h:mm a')}`;
}

export interface EventPillProps {
  event: CalendarEvent;
  className?: string;
}

export function EventPill({ event, className = '' }: EventPillProps) {
  const colorClass = COLOR_CLASSES[event.color] ?? COLOR_CLASSES.blue;
  const timeRange = timeRangeLabel(event.start, event.end);
  return (
    <div
      className={`calendar-event-pill rounded-lg px-3 py-2 flex flex-col gap-1 min-w-0 backdrop-blur-sm cursor-pointer antialiased ${colorClass} ${className}`}
      title={`${event.title} — ${timeRange}`}
    >
      <span className="text-xs font-semibold text-left truncate text-ink">{event.title}</span>
      <span className="text-[10px] font-normal text-ink/80 tabular-nums truncate">{timeRange}</span>
    </div>
  );
}

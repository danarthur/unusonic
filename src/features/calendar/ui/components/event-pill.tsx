'use client';

import { format } from 'date-fns';
import type { CalendarEvent, CalendarEventColor } from '@/features/calendar/model/types';

/** Left accent stripe + subtle fill. Status reads from the stripe color. */
const COLOR_CLASSES: Record<CalendarEventColor, string> = {
  emerald: 'border-l-[3px] border-l-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/10',
  amber: 'border-l-[3px] border-l-[var(--color-unusonic-warning)] bg-[var(--color-unusonic-warning)]/10 border-dashed',
  rose: 'border-l-[3px] border-l-[var(--color-unusonic-error)] bg-[var(--color-unusonic-error)]/10 opacity-60',
  blue: 'border-l-[3px] border-l-[var(--color-unusonic-info)] bg-[var(--color-unusonic-info)]/10 opacity-80',
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
  const isCancelled = event.status === 'cancelled';
  return (
    <div
      className={`calendar-event-pill rounded-lg px-3 py-2 flex flex-col gap-1 min-w-0 cursor-pointer antialiased ${colorClass} ${className}`}
      title={`${event.title} — ${timeRange}`}
      style={isCancelled ? {
        backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 4px, var(--color-unusonic-error) 4px, var(--color-unusonic-error) 5px)',
        backgroundSize: '100% 100%',
        backgroundBlendMode: 'overlay',
      } : undefined}
    >
      <span className="text-xs font-medium text-left truncate text-[var(--stage-text-primary)]">{event.title}</span>
      <span className="text-label font-normal text-[var(--stage-text-primary)]/80 tabular-nums truncate">{timeRange}</span>
    </div>
  );
}

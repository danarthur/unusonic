'use client';

import { format } from 'date-fns';
import type { CalendarEvent } from '@/features/calendar/model/types';

const COLOR_CLASSES: Record<CalendarEvent['color'], string> = {
  emerald:
    'border-l-emerald-500 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-400/10 dark:border-emerald-400/20',
  amber:
    'border-l-amber-500 bg-amber-500/10 dark:bg-amber-500/20 border border-amber-400/10 dark:border-amber-400/20',
  rose:
    'border-l-rose-500 bg-rose-500/10 dark:bg-rose-500/20 border border-rose-400/10 dark:border-rose-400/20',
  blue:
    'border-l-blue-500 bg-blue-500/10 dark:bg-blue-500/20 border border-blue-400/10 dark:border-blue-400/20',
};

export interface EventCardProps {
  event: CalendarEvent;
  /** Optional crew count when available from API */
  crewCount?: number | null;
  className?: string;
}

export function EventCard({ event, crewCount, className = '' }: EventCardProps) {
  const colorClass = COLOR_CLASSES[event.color] ?? COLOR_CLASSES.blue;
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);

  return (
    <div
      className={`liquid-panel-nested rounded-xl border-l-4 p-4 backdrop-blur-sm transition-all duration-300 antialiased ${colorClass} ${className}`}
    >
      <div className="text-xs font-medium text-ink-muted tabular-nums">
        {format(startDate, 'h:mm a')} – {format(endDate, 'h:mm a')}
      </div>
      <h3 className="text-base font-semibold text-ink mt-1 tracking-tight">{event.title}</h3>
      {event.clientName && (
        <p className="text-sm text-ink-muted mt-0.5 flex items-center gap-1.5">
          <span className="opacity-70">👤</span>
          {event.clientName}
        </p>
      )}
      {event.location && (
        <p className="text-sm text-ink-muted mt-1 flex items-center gap-1.5">
          <span className="opacity-70">📍</span>
          {event.location}
        </p>
      )}
      {event.projectTitle && (
        <p className="text-sm text-ink-muted mt-0.5 flex items-center gap-1.5">
          <span className="opacity-70">📁</span>
          {event.projectTitle}
        </p>
      )}
      {crewCount != null && (
        <p className="text-sm text-ink-muted mt-0.5 flex items-center gap-1.5">
          <span className="opacity-70">👥</span>
          {crewCount} crew
        </p>
      )}
    </div>
  );
}

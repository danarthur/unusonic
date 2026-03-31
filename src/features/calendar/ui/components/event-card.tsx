'use client';

import { format } from 'date-fns';
import { User, MapPin, Folder, Users } from 'lucide-react';
import type { CalendarEvent } from '@/features/calendar/model/types';

const COLOR_CLASSES: Record<CalendarEvent['color'], string> = {
  emerald: 'border-l-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/10 border border-[var(--color-unusonic-success)]/10',
  amber: 'border-l-[var(--color-unusonic-warning)] bg-[var(--color-unusonic-warning)]/10 border border-[var(--color-unusonic-warning)]/10',
  rose: 'border-l-[var(--color-unusonic-error)] bg-[var(--color-unusonic-error)]/10 border border-[var(--color-unusonic-error)]/10',
  blue: 'border-l-[var(--color-unusonic-info)] bg-[var(--color-unusonic-info)]/10 border border-[var(--color-unusonic-info)]/10',
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
      className={`stage-panel-nested rounded-xl border-l-4 p-4 transition-all duration-300 antialiased ${colorClass} ${className}`}
    >
      <div className="text-xs font-medium text-[var(--stage-text-secondary)] tabular-nums">
        {format(startDate, 'h:mm a')} – {format(endDate, 'h:mm a')}
      </div>
      <h3 className="text-base font-semibold text-[var(--stage-text-primary)] mt-1 tracking-tight">{event.title}</h3>
      {event.clientName && (
        <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5 flex items-center gap-1.5">
          <User size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
          {event.clientName}
        </p>
      )}
      {event.location && (
        <p className="text-sm text-[var(--stage-text-secondary)] mt-1 flex items-center gap-1.5">
          <MapPin size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
          {event.location}
        </p>
      )}
      {event.projectTitle && (
        <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5 flex items-center gap-1.5">
          <Folder size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
          {event.projectTitle}
        </p>
      )}
      {crewCount != null && (
        <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5 flex items-center gap-1.5">
          <Users size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
          {crewCount} crew
        </p>
      )}
    </div>
  );
}

'use client';

import { format } from 'date-fns';
import type { CalendarEvent } from '@/features/calendar/model/types';
import type { EventPosition, CollapsedSummary } from '@/features/calendar/lib/smart-stack';

/** Full-tile color (left bar + bg tint + border) to match EventCard. */
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

/** Time range: earliest to latest (e.g. "2:00p – 4:30p"). */
function timeRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (start <= end) {
    return `${format(new Date(startIso), 'h:mm a')} – ${format(new Date(endIso), 'h:mm a')}`;
  }
  return `${format(new Date(endIso), 'h:mm a')} – ${format(new Date(startIso), 'h:mm a')}`;
}

const fullTitle = (event: CalendarEvent) =>
  `${event.title} — ${timeRangeLabel(event.start, event.end)}`;

export interface WeekEventProps {
  position: EventPosition;
  onClick?: (evt: React.MouseEvent) => void;
}

export function WeekEvent({ position, onClick, variant = 'absolute' }: WeekEventProps & { variant?: 'absolute' | 'inline' }) {
  const { event, top, height, left, width } = position;
  const colorClass = COLOR_CLASSES[event.color] ?? COLOR_CLASSES.blue;
  const isGhost = event.status === 'planned';
  const isInline = variant === 'inline';
  const timeRange = timeRangeLabel(event.start, event.end);

  const baseClass = `
    group rounded-lg border-l-4 text-left overflow-hidden
    shadow-[var(--glass-shadow-nested)] hover:shadow-[var(--glass-shadow-nested-hover)]
    hover:border-[var(--glass-border-hover)] hover:brightness-[1.02]
    transition-all duration-300
    focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-1 focus:ring-offset-transparent
    ${colorClass}
    ${isGhost ? 'opacity-90' : ''}
  `.trim().replace(/\s+/g, ' ');

  /** Name first, time below (earliest–latest). Title prioritized; time in smaller muted text. */
  const pillContent = (
    <span className="flex flex-col min-w-0 text-left px-2.5 py-2 gap-1">
      <span className="text-xs font-medium text-ink truncate">{event.title}</span>
      <span className="text-[10px] font-normal text-ink/80 tabular-nums truncate">{timeRange}</span>
    </span>
  );

  if (isInline) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`w-full relative min-h-[40px] flex items-center justify-start ${baseClass}`}
        title={fullTitle(event)}
      >
        {pillContent}
      </button>
    );
  }

  const useSideBySide = width < 100 && left >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute z-10 hover:z-50 flex items-center ${useSideBySide ? '' : 'left-[3px] right-[3px]'} ${baseClass}`}
      style={{
        top: `${top}%`,
        height: `${height}%`,
        minHeight: 28,
        ...(useSideBySide && {
          left: `calc(${left}% + 2px)`,
          width: `calc(${width}% - 4px)`,
        }),
      }}
      title={fullTitle(event)}
    >
      {pillContent}
    </button>
  );
}

export interface CollapsedBarProps {
  summary: CollapsedSummary;
}

export function CollapsedBar({ summary }: CollapsedBarProps) {
  const { events, top, height } = summary;
  const label = events.length === 1
    ? events[0].title
    : `+${events.length} more`;

  return (
    <div
      className="absolute left-[3px] right-[3px] rounded-xl border border-[var(--glass-border)] liquid-panel-nested flex items-center px-3 z-0 overflow-hidden shadow-[var(--glass-shadow-nested)] hover:border-[var(--glass-border-hover)] hover:shadow-[var(--glass-shadow-nested-hover)] hover:bg-[var(--glass-bg-hover)] transition-all duration-300"
      style={{
        top: `${top}%`,
        height: `${height}%`,
        minHeight: 24,
      }}
    >
      <span className="text-[10px] font-medium text-ink/80 truncate tracking-tight">
        {label}
      </span>
    </div>
  );
}

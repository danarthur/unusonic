'use client';

import { format } from 'date-fns';
import type { CalendarEvent } from '@/features/calendar/model/types';
import type { EventPosition, CollapsedSummary } from '@/features/calendar/lib/smart-stack';

/** Left accent stripe (status color) + neutral glass border + subtle fill.
 *  Hold (amber): dashed left border. Cancelled (rose): reduced opacity. Planned (blue): slightly muted. */
const COLOR_CLASSES: Record<CalendarEvent['color'], string> = {
  emerald: 'border-l-[3px] border-l-[var(--color-unusonic-success)] bg-[var(--color-unusonic-success)]/12 border border-[oklch(1_0_0_/_0.08)]/10',
  amber: 'border-l-[3px] border-l-[var(--color-unusonic-warning)] bg-[var(--color-unusonic-warning)]/12 border border-[oklch(1_0_0_/_0.08)]/10 border-l-dashed',
  rose: 'border-l-[3px] border-l-[var(--color-unusonic-error)] bg-[var(--color-unusonic-error)]/12 border border-[oklch(1_0_0_/_0.08)]/10 opacity-60',
  blue: 'border-l-[3px] border-l-[var(--color-unusonic-info)] bg-[var(--color-unusonic-info)]/12 border border-[oklch(1_0_0_/_0.08)]/10 opacity-80',
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
  const isCancelled = event.status === 'cancelled';
  const isInline = variant === 'inline';
  const timeRange = timeRangeLabel(event.start, event.end);

  const baseClass = `
    group rounded-lg border-l-4 text-left overflow-hidden
    shadow-md hover:shadow-lg
    transition-colors duration-100
    focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-transparent
    ${colorClass}
  `.trim().replace(/\s+/g, ' ');

  /** Name first, time below (earliest–latest). Title prioritized; time in smaller muted text. */
  const pillContent = (
    <span className="flex flex-col min-w-0 text-left px-2.5 py-2 gap-1">
      <span className="text-xs font-medium text-[var(--stage-text-primary)] truncate">{event.title}</span>
      <span className="text-label font-normal text-[var(--stage-text-primary)]/80 tabular-nums truncate">{timeRange}</span>
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
      className="absolute left-[3px] right-[3px] rounded-xl border border-[oklch(1_0_0_/_0.08)] stage-panel-nested flex items-center px-3 z-0 overflow-hidden shadow-md transition-colors duration-100"
      style={{
        top: `${top}%`,
        height: `${height}%`,
        minHeight: 24,
      }}
    >
      <span className="text-label font-medium text-[var(--stage-text-primary)]/80 truncate tracking-tight">
        {label}
      </span>
    </div>
  );
}

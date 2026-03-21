'use client';

import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  format,
  type Locale,
} from 'date-fns';
import type { CalendarEvent } from '@/features/calendar/model/types';
import { EventPill } from '@/features/calendar/ui/components/event-pill';
import { SmartGroupContainerBlock } from '@/features/calendar/ui/components/smart-group-container';
import { WeekEvent } from '@/features/calendar/ui/components/week-event';

const WEEK_STARTS_ON = 1; // Monday

function dayKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function eventOverlapsDay(event: CalendarEvent, dayKeyStr: string): boolean {
  const dayStart = new Date(dayKeyStr + 'T00:00:00').getTime();
  const dayEnd = new Date(dayKeyStr + 'T23:59:59.999').getTime();
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return start <= dayEnd && end >= dayStart;
}

function getEventsByDay(events: CalendarEvent[], dayKeys: string[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const key of dayKeys) {
    map.set(key, events.filter((e) => eventOverlapsDay(e, key)));
  }
  return map;
}

export interface MonthGridProps {
  events: CalendarEvent[];
  viewDate: Date;
  /** When an event is clicked, open the day blade for that date */
  onEventClick?: (event: CalendarEvent) => void;
  /** When a day number is clicked, open the day blade for that date */
  onDayClick?: (dateStr: string) => void;
  locale?: Locale;
}

export function MonthGrid({ events, viewDate, onEventClick, onDayClick, locale }: MonthGridProps) {
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON, locale });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON, locale });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const dayKeys = days.map((d) => dayKey(d));
  const eventsByDay = getEventsByDay(events, dayKeys);

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="h-full min-h-0 flex flex-col rounded-2xl overflow-hidden liquid-panel border border-[var(--glass-border)]">
      {/* Weekday headers — Liquid Japandi: semantic tokens, tight tracking */}
      <div className="grid grid-cols-7 gap-px border-b border-[var(--glass-border)] rounded-t-2xl overflow-hidden shrink-0 bg-[var(--glass-bg)]/30 backdrop-blur-sm">
        {weekdays.map((label) => (
          <div
            key={label}
            className="px-2 py-3 text-center text-sm font-semibold text-ink/80 tracking-tight"
          >
            {label}
          </div>
        ))}
      </div>
      {/* Days grid — fixed min row height so boxes stay consistent size */}
      <div className="grid grid-cols-7 gap-px rounded-b-2xl overflow-hidden flex-1 min-h-0 grid-auto-rows-[minmax(100px,1fr)] bg-[var(--glass-bg)]/10">
        {days.map((day) => {
          const key = dayKey(day);
          const dayEvents = eventsByDay.get(key) ?? [];
          const inMonth = isSameMonth(day, viewDate);
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={`min-h-[100px] flex flex-col gap-1.5 p-2.5 overflow-hidden border-r border-b border-[var(--glass-border)]/50 last:border-r-0 ${
                inMonth ? 'bg-[var(--glass-bg)]/40' : 'bg-ink/[0.02]'
              } ${isToday ? 'ring-2 ring-inset ring-[var(--today-ring)] bg-[var(--today-bg)]' : ''}`}
            >
              {onDayClick ? (
                <button
                  type="button"
                  onClick={() => onDayClick(key)}
                  className={`text-sm md:text-base font-semibold tabular-nums shrink-0 hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ring)] rounded ${
                    inMonth ? 'text-ink' : 'text-ink/70'
                  }`}
                >
                  {format(day, 'd')}
                </button>
              ) : (
                <span
                  className={`text-sm md:text-base font-semibold tabular-nums shrink-0 ${
                    inMonth ? 'text-ink' : 'text-ink/70'
                  }`}
                >
                  {format(day, 'd')}
                </span>
              )}
              <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-auto">
                {dayEvents.length === 1 ? (
                  <button
                    type="button"
                    onClick={() => onEventClick?.(dayEvents[0])}
                    className="text-left w-full rounded-lg transition-all duration-300 hover:bg-ceramic/10 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-inset"
                  >
                    <EventPill event={dayEvents[0]} />
                  </button>
                ) : dayEvents.length >= 2 ? (
                  <SmartGroupContainerBlock>
                    {dayEvents.map((event) => (
                      <WeekEvent
                        key={event.id}
                        position={{ event, top: 0, height: 0, left: 0, width: 100 }}
                        variant="inline"
                        onClick={() => onEventClick?.(event)}
                      />
                    ))}
                  </SmartGroupContainerBlock>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

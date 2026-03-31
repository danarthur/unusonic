'use client';

import { useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isBefore,
  startOfDay,
  getMonth,
  getYear,
  getDate,
  format,
  type Locale,
} from 'date-fns';
import type { CalendarEvent } from '@/features/calendar/model/types';

const WEEK_STARTS_ON = 1;

const COLOR_DOT: Record<string, string> = {
  emerald: 'bg-[var(--color-unusonic-success)]',
  amber: 'bg-[var(--color-unusonic-warning)]',
  rose: 'bg-[var(--color-unusonic-error)]',
  blue: 'bg-[var(--color-unusonic-info)]',
};

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

export interface YearGridProps {
  events: CalendarEvent[];
  viewDate: Date;
  onMonthSelect: (year: number, month: number) => void;
  onDateSelect?: (year: number, month: number, day: number) => void;
  locale?: Locale;
  className?: string;
}

interface MonthCardProps {
  month: number;
  year: number;
  days: Date[];
  countByDay: { key: string; count: number; colors: string[] }[];
  totalEvents: number;
  todayKey: string;
  onMonthSelect: (year: number, month: number) => void;
  onDateSelect?: (year: number, month: number, day: number) => void;
}

function MonthCard({
  month,
  year,
  days,
  countByDay,
  totalEvents,
  todayKey,
  onMonthSelect,
  onDateSelect,
}: MonthCardProps) {
  const today = startOfDay(new Date());

  const handleDayClick = onDateSelect
    ? (day: Date) => {
        const dMonth = getMonth(day) + 1;
        const dYear = getYear(day);
        if (dYear === year && dMonth === month) {
          onDateSelect(dYear, dMonth, getDate(day));
        }
      }
    : undefined;

  return (
    <div
      className="flex flex-col p-4 rounded-2xl text-left stage-panel stage-panel-nested border border-[oklch(1_0_0_/_0.08)] h-full transition-colors duration-200"
    >
      {/* Month header — click to navigate */}
      <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0">
        <button
          type="button"
          onClick={() => onMonthSelect(year, month)}
          className="text-base font-semibold text-[var(--stage-text-primary)] hover:underline focus:outline-none focus:underline text-left tracking-tight"
        >
          {format(new Date(year, month - 1, 1), 'MMMM')}
        </button>
        {totalEvents > 0 && (
          <span className="text-xs text-[var(--stage-text-secondary)]/50 tabular-nums shrink-0">
            {totalEvents}
          </span>
        )}
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5 shrink-0">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, i) => (
          <div key={i} className="text-[9px] font-medium text-[var(--stage-text-secondary)]/40 text-center tracking-widest">
            {letter}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        className="grid grid-cols-7 gap-0.5 flex-1 min-h-0"
        style={{ gridAutoRows: 'minmax(22px, 1fr)' }}
      >
        {days.map((day, i) => {
          const { count, colors } = countByDay[i];
          const isCurrentMonth = getMonth(day) === month - 1 && getYear(day) === year;
          const dayNum = getDate(day);
          const hasEvents = count > 0;
          const isToday = dayKey(day) === todayKey;
          const isPast = !isToday && isBefore(day, today);

          if (!isCurrentMonth) {
            return (
              <div
                key={dayKey(day)}
                className="flex flex-col items-center justify-center text-[10px] text-[var(--stage-text-primary)]/20 rounded"
              >
                {dayNum}
              </div>
            );
          }

          const onClick = handleDayClick
            ? () => handleDayClick(day)
            : () => onMonthSelect(year, month);

          return (
            <button
              key={dayKey(day)}
              type="button"
              onClick={onClick}
              title={hasEvents ? `${count} event${count !== 1 ? 's' : ''}` : undefined}
              className={`flex flex-col items-center justify-center rounded transition-colors duration-150 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[oklch(1_0_0_/_0.08)] focus:ring-inset ${
                isToday
                  ? 'bg-[var(--color-unusonic-error)] text-[oklch(0.10_0_0)] text-[10px] font-medium'
                  : isPast
                    ? 'text-[10px] text-[var(--stage-text-primary)]/40 hover:bg-[var(--stage-surface)]/40'
                    : hasEvents
                      ? 'text-[10px] font-medium text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface)]/60'
                      : 'text-[10px] text-[var(--stage-text-primary)]/60 hover:bg-[var(--stage-surface)]/40'
              }`}
            >
              <span>{dayNum}</span>
              {hasEvents && !isToday && (
                <div className="flex gap-[2px] mt-px">
                  {colors.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className={`block w-1 h-1 rounded-full shrink-0 ${COLOR_DOT[c] ?? COLOR_DOT.blue}`}
                    />
                  ))}
                  {count > 3 && (
                    <span className="block w-1 h-1 rounded-full shrink-0 bg-[var(--stage-text-secondary)]/50" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function YearGrid({ events, viewDate, onMonthSelect, onDateSelect, locale, className }: YearGridProps) {
  const year = getYear(viewDate);
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  const months = useMemo(() => {
    const result: { month: number; days: Date[]; dayKeys: string[] }[] = [];
    for (let m = 1; m <= 12; m++) {
      const d = new Date(year, m - 1, 15);
      const monthStart = startOfMonth(d);
      const monthEnd = endOfMonth(d);
      const gridStart = startOfWeek(monthStart, { weekStartsOn: WEEK_STARTS_ON, locale });
      const gridEnd = endOfWeek(monthEnd, { weekStartsOn: WEEK_STARTS_ON, locale });
      const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
      result.push({
        month: m,
        days,
        dayKeys: days.map((day) => dayKey(day)),
      });
    }
    return result;
  }, [year, locale]);

  return (
    <div
      className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 rounded-2xl min-h-0 ${className ?? ''}`.trim()}
    >
      {months.map(({ month, days, dayKeys }) => {
        const countByDay = dayKeys.map((key) => {
          const dayEvents = events.filter((e) => eventOverlapsDay(e, key));
          const colors = [...new Set(dayEvents.map((e) => e.color))];
          return { key, count: dayEvents.length, colors };
        });
        const totalEvents = countByDay.reduce((sum, d) => sum + d.count, 0);
        return (
          <MonthCard
            key={month}
            month={month}
            year={year}
            days={days}
            countByDay={countByDay}
            totalEvents={totalEvents}
            todayKey={todayKey}
            onMonthSelect={onMonthSelect}
            onDateSelect={onDateSelect}
          />
        );
      })}
    </div>
  );
}

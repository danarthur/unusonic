'use client';

import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  getMonth,
  getYear,
  getDate,
  format,
  type Locale,
} from 'date-fns';
import { motion } from 'framer-motion';
import type { CalendarEvent } from '@/features/calendar/model/types';

const WEEK_STARTS_ON = 1;
const SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

const COLOR_DOT: Record<string, string> = {
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  blue: 'bg-blue-500',
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
  /** When a specific day is clicked, go to month view on that date */
  onDateSelect?: (year: number, month: number, day: number) => void;
  locale?: Locale;
  className?: string;
}

interface MonthCardProps {
  month: number;
  year: number;
  days: Date[];
  dayKeys: string[];
  countByDay: { key: string; count: number; colors: string[] }[];
  totalEvents: number;
  todayKey: string;
  isExpanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
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
  isExpanded,
  onExpand,
  onCollapse,
  onMonthSelect,
  onDateSelect,
}: MonthCardProps) {
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = useCallback(() => {
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
      collapseTimeoutRef.current = null;
    }
    onExpand();
  }, [onExpand]);

  const handleLeave = useCallback(() => {
    collapseTimeoutRef.current = setTimeout(() => onCollapse(), 150);
  }, [onCollapse]);

  useEffect(() => () => {
    if (collapseTimeoutRef.current) clearTimeout(collapseTimeoutRef.current);
  }, []);

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
    <motion.div
      layout={false}
      initial={false}
      animate={{
        zIndex: isExpanded ? 50 : 0,
        scale: isExpanded ? 1.02 : 1,
        boxShadow: isExpanded
          ? '0 12px 40px -8px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(1 0 0 / 0.1), 0 0 24px -4px oklch(0.70 0.15 250 / 0.12)'
          : '0 4px 24px -1px oklch(0 0 0 / 0.2), inset 0 1px 0 0 oklch(1 0 0 / 0.04)',
        backdropFilter: isExpanded ? 'blur(20px) saturate(150%)' : 'none',
      }}
      transition={SPRING}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      className={`flex flex-col p-4 rounded-2xl text-left liquid-panel liquid-panel-nested border transition-colors ${
        isExpanded
          ? 'absolute top-0 left-0 w-[calc(100%+1.5rem)] -ml-[0.75rem] min-h-[280px] overflow-hidden border-[var(--glass-border-hover)]'
          : 'h-full w-full min-h-0 overflow-hidden border-[var(--glass-border)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1 shrink-0">
        <button
          type="button"
          onClick={() => onMonthSelect(year, month)}
          className="text-base font-semibold text-ink hover:underline focus:outline-none focus:underline text-left"
        >
          {format(new Date(year, month - 1, 1), 'MMMM')}
        </button>
        {totalEvents > 0 ? (
          <span className="text-xs text-ink/70 tabular-nums shrink-0">
            {totalEvents}
          </span>
        ) : null}
      </div>
      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-0.5 shrink-0">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((letter, i) => (
          <div key={i} className="text-[10px] font-medium text-ink/80 text-center">
            {letter}
          </div>
        ))}
      </div>
      <div
        className={`grid grid-cols-7 gap-0.5 transition-[min-height] duration-300 ease-out ${
          isExpanded
            ? 'min-h-[154px] shrink-0'
            : 'flex-1 min-h-[72px] overflow-hidden'
        }`}
        style={{ gridAutoRows: 'minmax(16px, 1fr)' }}
      >
        {days.map((day, i) => {
          const { count, colors } = countByDay[i];
          const isCurrentMonth = getMonth(day) === month - 1 && getYear(day) === year;
          const dayNum = getDate(day);
          const hasEvents = count > 0;
          const isToday = dayKey(day) === todayKey;

          if (!isCurrentMonth) {
            return (
              <div
                key={dayKey(day)}
                className={`flex flex-col items-center justify-center min-h-[18px] text-ink/60 text-[10px] rounded ${isToday ? 'ring-2 ring-inset ring-[var(--today-ring)] bg-[var(--today-bg)]' : ''}`}
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
              title={
                hasEvents
                  ? `${dayNum}: ${count} event${count !== 1 ? 's' : ''} — click to open month`
                  : `${dayNum} — click to open month`
              }
              className={`flex flex-col items-center justify-center min-h-[18px] rounded text-[10px] font-medium transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--glass-border-hover)] focus:ring-inset ${
                hasEvents
                  ? 'bg-[var(--glass-bg)]/60 text-ink hover:bg-[var(--glass-bg-hover)] hover:shadow-[var(--glass-shadow-nested)] border border-[var(--glass-border)]/50'
                  : 'text-ink/80 hover:bg-[var(--glass-bg)]/40 hover:border-[var(--glass-border)]/50'
              } ${isToday ? 'ring-2 ring-inset ring-[var(--today-ring)] bg-[var(--today-bg)]' : ''}`}
            >
              <span>{dayNum}</span>
              {hasEvents && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-full">
                  {colors.slice(0, 3).map((c) => (
                    <span
                      key={c}
                      className={`block w-1 h-1 rounded-full shrink-0 ${COLOR_DOT[c] ?? COLOR_DOT.blue}`}
                    />
                  ))}
                  {count > 3 && (
                    <span className="block w-1 h-1 rounded-full shrink-0 bg-ink-muted" />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

export function YearGrid({ events, viewDate, onMonthSelect, onDateSelect, locale, className }: YearGridProps) {
  const year = getYear(viewDate);
  const todayKey = format(new Date(), 'yyyy-MM-dd');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);

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
      className={`grid grid-cols-2 md:grid-cols-4 gap-2 rounded-2xl min-h-0 grid-auto-rows-[minmax(140px,1fr)] overflow-visible ${className ?? ''}`.trim()}
    >
      {months.map(({ month, days, dayKeys }) => {
        const countByDay = dayKeys.map((key) => {
          const dayEvents = events.filter((e) => eventOverlapsDay(e, key));
          const colors = [...new Set(dayEvents.map((e) => e.color))];
          return { key, count: dayEvents.length, colors };
        });
        const totalEvents = countByDay.reduce((sum, d) => sum + d.count, 0);
        return (
          <div key={month} className="relative min-h-0 min-w-0">
            <MonthCard
              month={month}
              year={year}
              days={days}
              dayKeys={dayKeys}
              countByDay={countByDay}
              totalEvents={totalEvents}
              todayKey={todayKey}
              isExpanded={hoveredMonth === month}
              onExpand={() => setHoveredMonth(month)}
              onCollapse={() => setHoveredMonth(null)}
              onMonthSelect={onMonthSelect}
              onDateSelect={onDateSelect}
            />
          </div>
        );
      })}
    </div>
  );
}

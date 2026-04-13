'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  startOfWeek,
  endOfWeek,
  addDays,
  addHours,
  format,
  isBefore,
  startOfDay,
  type Locale,
} from 'date-fns';
import type { CalendarEvent } from '@/features/calendar/model/types';
import { calculateSmartStack } from '@/features/calendar/lib/smart-stack';
import { WeekEvent, CollapsedBar } from '@/features/calendar/ui/components/week-event';
import { SmartGroupContainer } from '@/features/calendar/ui/components/smart-group-container';

const WEEK_STARTS_ON = 1; // Monday
const DAY_START_HOUR = 6; // 6 AM
const DAY_END_HOUR = 3; // 3 AM next day
const PADDING_HOURS = 4; // ±4h around event range so e.g. 3pm–9pm shows 11am–1am
const MIN_WINDOW_HOURS = 12;
const MAX_WINDOW_HOURS = 36;
const DEFAULT_WINDOW_HOURS = 21; // 6 AM → 3 AM next day when no events
const DEFAULT_MAX_VISIBLE_IN_GROUP = 6;

/** Fallback day window when week has no events: 6 AM → 3 AM next day. */
function getDefaultWindowForDay(day: Date): { start: Date; end: Date } {
  const start = new Date(day);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  const end = addDays(day, 1);
  end.setHours(DAY_END_HOUR, 0, 0, 0);
  return { start, end };
}

export interface WeekTimeWindow {
  start: Date;
  end: Date;
  totalRows: number;
}

/**
 * One shared time window for the week: ±PADDING_HOURS around all events.
 * Example: event Sat 3pm–9pm → window 11am–1am (next day). Event Mon 12am–4am → included so window extends to show it.
 * When there are no events, falls back to 6 AM → 3 AM next day for the first day of the week.
 */
function getWindowForWeek(
  events: CalendarEvent[],
  weekStart: Date,
  weekEnd: Date
): WeekTimeWindow {
  const weekStartMs = weekStart.getTime();
  const weekEndMs = weekEnd.getTime() + 24 * 60 * 60 * 1000; // end of last day

  const eventsInWeek = events.filter((e) => {
    const start = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    return end >= weekStartMs && start <= weekEndMs;
  });

  if (eventsInWeek.length === 0) {
    const { start, end } = getDefaultWindowForDay(weekStart);
    const totalRows = DEFAULT_WINDOW_HOURS;
    return { start, end, totalRows };
  }

  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const e of eventsInWeek) {
    const s = new Date(e.start).getTime();
    const e_ = new Date(e.end).getTime();
    if (s < minStart) minStart = s;
    if (e_ > maxEnd) maxEnd = e_;
  }

  const padMs = PADDING_HOURS * 60 * 60 * 1000;
  const winStart = new Date(minStart - padMs);
  const winEnd = new Date(maxEnd + padMs);
  const durationMs = winEnd.getTime() - winStart.getTime();
  const durationHours = durationMs / (60 * 60 * 1000);
  const totalRows = Math.min(
    MAX_WINDOW_HOURS,
    Math.max(MIN_WINDOW_HOURS, Math.round(durationHours))
  );

  return { start: winStart, end: winEnd, totalRows };
}

function eventOverlapsDay(event: CalendarEvent, dayKey: string): boolean {
  const dayStart = new Date(dayKey + 'T00:00:00').getTime();
  const dayEnd = new Date(dayKey + 'T23:59:59.999').getTime();
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  return start <= dayEnd && end >= dayStart;
}

/** Events with zero visible time in the day window (e.g. 12 AM–6 AM when window starts at 6 AM) are excluded so they don’t render as a crushed pill at the top. */
function eventOverlapsWindow(event: CalendarEvent, winStart: Date, winEnd: Date): boolean {
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const wStart = winStart.getTime();
  const wEnd = winEnd.getTime();
  return end > wStart && start < wEnd;
}

export interface WeekGridProps {
  events: CalendarEvent[];
  viewDate: Date;
  onEventClick?: (event: CalendarEvent, date: string) => void;
  /** When user clicks a day (header or empty column area), open day blade for that date. */
  onDayClick?: (dateStr: string) => void;
  /** Max events per collision group before collapsing the rest. Default 5. */
  maxVisibleInGroup?: number;
  locale?: Locale;
}

export function WeekGrid({ events, viewDate, onEventClick, onDayClick, maxVisibleInGroup = DEFAULT_MAX_VISIBLE_IN_GROUP, locale }: WeekGridProps) {
  const weekStart = startOfWeek(viewDate, { weekStartsOn: WEEK_STARTS_ON, locale });
  const weekEnd = endOfWeek(viewDate, { weekStartsOn: WEEK_STARTS_ON, locale });
  const days = useMemo(() => {
    const d: Date[] = [];
    let cur = new Date(weekStart);
    while (cur <= weekEnd) {
      d.push(new Date(cur));
      cur = addDays(cur, 1);
    }
    return d;
  }, [weekStart, weekEnd]);

  const weekWindow = useMemo(
    () => getWindowForWeek(events, weekStart, weekEnd),
    [events, weekStart, weekEnd]
  );
  const { start: winStart, end: winEnd, totalRows } = weekWindow;
  const rowHeight = 48;
  const todayKey = format(new Date(), 'yyyy-MM-dd');

  // Now line: tracks current time position, updates every 60s
  const [nowPct, setNowPct] = useState<number | null>(null);
  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const winStartMs = winStart.getTime();
      const winEndMs = winEnd.getTime();
      const nowMs = now.getTime();
      if (nowMs >= winStartMs && nowMs <= winEndMs) {
        setNowPct(((nowMs - winStartMs) / (winEndMs - winStartMs)) * 100);
      } else {
        setNowPct(null);
      }
    };
    compute();
    const interval = setInterval(compute, 60_000);
    return () => clearInterval(interval);
  }, [winStart, winEnd]);

  const hourLabel = (hour: number) => {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    return `${hour < 12 ? hour : hour - 12} ${hour < 12 ? 'AM' : 'PM'}`;
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden stage-panel border border-[oklch(1_0_0_/_0.08)]">
      {/* Day headers — clickable to open day blade */}
      <div
        className="grid shrink-0 border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]/30"
        style={{ gridTemplateColumns: 'auto repeat(7, 1fr)' }}
      >
        <div className="w-14 min-w-[3.5rem] p-2" />
        {days.map((d) => {
          const dayKey = format(d, 'yyyy-MM-dd');
          const isToday = dayKey === todayKey;
          const headerContent = (
            <div className="flex flex-col items-center gap-0.5">
              <span className="stage-label text-[var(--stage-text-secondary)]/60">{format(d, 'EEE')}</span>
              <span className={`text-lg tabular-nums ${
                isToday ? 'font-medium w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-unusonic-error)] text-[oklch(0.10_0_0)]' : 'font-light text-[var(--stage-text-primary)]'
              }`}>{format(d, 'd')}</span>
            </div>
          );
          return onDayClick ? (
            <button
              key={dayKey}
              type="button"
              onClick={() => onDayClick(dayKey)}
              className={`p-2 text-center tracking-tight stage-hover overflow-hidden rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset ${
                isToday ? 'bg-[var(--today-bg)]' : ''
              }`}
            >
              {headerContent}
            </button>
          ) : (
            <div
              key={dayKey}
              className={`p-2 text-center tracking-tight rounded-lg ${
                isToday ? 'bg-[var(--today-bg)]' : ''
              }`}
            >
              {headerContent}
            </div>
          );
        })}
      </div>

      {/* Scrollable body: time axis + day columns */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div
          className="grid min-w-[600px]"
          style={{
            gridTemplateColumns: 'auto repeat(7, 1fr)',
            gridTemplateRows: `repeat(${totalRows}, ${rowHeight}px)`,
            minHeight: `${totalRows * rowHeight}px`,
          }}
        >
          {/* Time axis: behind day content (z-0); compact labels, design-system tokens */}
          <div
            className="sticky left-0 z-0 flex flex-col border-r border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]/50"
            style={{ gridRow: '1 / -1' }}
          >
            {Array.from({ length: totalRows }).map((_, i) => {
              const rowTime = addHours(winStart, i);
              const hour = rowTime.getHours();
              return (
                <div
                  key={i}
                  className="flex items-center justify-end pr-3 pl-1 text-xs font-medium text-[var(--stage-text-primary)]/80 tracking-tight tabular-nums border-b border-[oklch(1_0_0_/_0.08)]/15"
                  style={{ height: rowHeight }}
                >
                  {hourLabel(hour)}
                </div>
              );
            })}
          </div>

          {/* Day columns: Smart Stack (Standard 1–2 / Stack 3+) + collapsed */}
          {days.map((day) => {
            const dayKey = format(day, 'yyyy-MM-dd');
            const isToday = dayKey === todayKey;
            const dayEvents = events.filter((e) => eventOverlapsDay(e, dayKey));
            const dayEventsInWindow = dayEvents.filter((e) => eventOverlapsWindow(e, winStart, winEnd));
            const { standard, stackGroups, collapsed } = calculateSmartStack(dayEventsInWindow, winStart, winEnd, {
              maxVisibleInGroup,
            });
            /* Key so column + event layer remount when filter/layout changes; avoids stale stack when 3→1 */
            const dayColumnKey = `${dayKey}-${dayEventsInWindow.map((e) => e.id).sort().join(',')}`;
            const layoutKey = `${standard.length}s-${stackGroups.length}t-${collapsed.length}c-${standard.map((p) => p.event.id).join(',')}-${stackGroups.map((g) => g.events.map((e) => e.id).join('+')).join(';')}`;

            return (
              <div
                key={dayColumnKey}
                className={`relative border-r border-[oklch(1_0_0_/_0.08)]/20 last:border-r-0 bg-[oklch(0.10_0_0)]/20 ${
                  isToday ? 'bg-[var(--today-bg)]' : isBefore(day, startOfDay(new Date())) ? 'opacity-60 saturate-[0.7]' : ''
                }`}
                style={{
                  gridRow: '1 / -1',
                  minHeight: `${totalRows * rowHeight}px`,
                }}
              >
                {/* Hour grid lines — behind event layer */}
                <div className="absolute inset-0 z-0 flex flex-col pointer-events-none">
                  {Array.from({ length: totalRows }).map((_, i) => (
                    <div
                      key={i}
                      className="border-b border-[oklch(1_0_0_/_0.08)]/15"
                      style={{ height: rowHeight }}
                    />
                  ))}
                </div>

                {/* Now line — current time indicator in today's column */}
                {isToday && nowPct !== null && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none flex items-center"
                    style={{ top: `${nowPct}%` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-[var(--color-unusonic-error)] shadow-[0_0_8px_var(--color-unusonic-error)/40] -ml-1 shrink-0" />
                    <div className="flex-1 h-[2px] bg-[var(--color-unusonic-error)] shadow-[0_0_6px_var(--color-unusonic-error)/30]" />
                  </div>
                )}

                {/* Event tiles: key forces remount when stack↔standard so no stale stack when filter leaves 1 */}
                <div className="absolute inset-0 z-10 pointer-events-none">
                  <div
                    key={layoutKey}
                    className="relative w-full h-full"
                    style={{ pointerEvents: 'auto' }}
                    onClick={(e) => {
                      if (onDayClick && e.target === e.currentTarget) {
                        onDayClick(dayKey);
                      }
                    }}
                  >
                    {collapsed.map((summary) => (
                      <CollapsedBar
                        key={`collapsed-${dayKey}-${summary.events.map((ev) => ev.id).join('-')}`}
                        summary={summary}
                      />
                    ))}
                    {standard.map((position) => (
                      <WeekEvent
                        key={position.event.id}
                        position={position}
                        onClick={(evt) => {
                          evt.stopPropagation();
                          onEventClick?.(position.event, dayKey);
                        }}
                      />
                    ))}
                    {stackGroups.map((group) => (
                      <SmartGroupContainer
                        key={`stack-${dayKey}-${group.events.map((e) => e.id).join('-')}`}
                        top={group.top}
                        height={group.height}
                        labelStart={group.labelStart}
                        labelEnd={group.labelEnd}
                      >
                        {group.events.map((event) => (
                          <WeekEvent
                            key={event.id}
                            position={{ event, top: 0, height: 0, left: 0, width: 100 }}
                            onClick={(evt) => {
                              evt.stopPropagation();
                              onEventClick?.(event, dayKey);
                            }}
                            variant="inline"
                          />
                        ))}
                      </SmartGroupContainer>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

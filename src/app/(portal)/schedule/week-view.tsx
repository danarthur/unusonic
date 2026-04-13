'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, DollarSign, Clock } from 'lucide-react';
import type { CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';
import type { BlackoutRange } from '@/features/ops/actions/save-availability';
import { format } from 'date-fns';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Helpers ─────────────────────────────────────────────────────── */

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  // Start on Monday (day 1). If Sunday (0), go back 6.
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(iso: string): string {
  return format(new Date(iso), 'h:mm a');
}

function formatRate(rate: number | null, type: string | null, hours: number | null): string | null {
  if (!rate) return null;
  if (type === 'hourly' && hours) return `$${(rate * hours).toFixed(0)}`;
  return `$${Number(rate).toFixed(0)}`;
}

function expandBlackouts(ranges: BlackoutRange[]): Set<string> {
  const set = new Set<string>();
  for (const range of ranges) {
    const start = new Date(range.start + 'T12:00:00');
    const end = new Date(range.end + 'T12:00:00');
    const cursor = new Date(start);
    while (cursor <= end) {
      set.add(toDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return set;
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: 'border-l-[oklch(0.75_0.15_145)]',
  requested: 'border-l-[oklch(0.75_0.15_55)]',
  dispatched: 'border-l-[var(--stage-text-tertiary)]',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/* ── Component ───────────────────────────────────────────────────── */

interface WeekViewProps {
  entries: CrewScheduleEntry[];
  blackouts: BlackoutRange[];
}

export function WeekView({ entries, blackouts }: WeekViewProps) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const todayStr = useMemo(() => toDateStr(today), [today]);
  const [weekStart, setWeekStart] = useState(() => getWeekStart(today));

  const blackoutSet = useMemo(() => expandBlackouts(blackouts), [blackouts]);

  // Build the 7-day array
  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return { date, dateStr: toDateStr(date) };
    });
  }, [weekStart]);

  // Map entries by date
  const entryMap = useMemo(() => {
    const map = new Map<string, CrewScheduleEntry[]>();
    for (const entry of entries) {
      if (!entry.starts_at) continue;
      const key = toDateStr(new Date(entry.starts_at));
      const list = map.get(key) ?? [];
      list.push(entry);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  const navigateWeek = useCallback((delta: number) => {
    setWeekStart(prev => addDays(prev, delta * 7));
  }, []);

  const goToToday = useCallback(() => {
    setWeekStart(getWeekStart(today));
  }, [today]);

  // Week label
  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6);
    const startMonth = format(weekStart, 'MMM');
    const endMonth = format(end, 'MMM');
    if (startMonth === endMonth) {
      return `${startMonth} ${weekStart.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}, ${end.getFullYear()}`;
  }, [weekStart]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-4"
    >
      {/* Week navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigateWeek(-1)}
          aria-label="Previous week"
          className="p-2 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
            {weekLabel}
          </h2>
          {toDateStr(weekStart) !== toDateStr(getWeekStart(today)) && (
            <button
              onClick={goToToday}
              className="text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] px-2 py-0.5 rounded bg-[oklch(1_0_0/0.06)] transition-colors"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={() => navigateWeek(1)}
          aria-label="Next week"
          className="p-2 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.04)] transition-colors"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Day columns */}
      <div className="grid grid-cols-7 gap-2">
        {days.map(({ date, dateStr }) => {
          const isToday = dateStr === todayStr;
          const isBlackout = blackoutSet.has(dateStr);
          const dayEntries = entryMap.get(dateStr) ?? [];
          const isPast = date < today && !isToday;

          return (
            <div key={dateStr} className="flex flex-col gap-1.5">
              {/* Day header */}
              <div className={`text-center pb-1.5 border-b border-[oklch(1_0_0/0.04)] ${isPast ? 'opacity-50' : ''}`}>
                <p className="stage-label text-[var(--stage-text-tertiary)]">
                  {DAYS[date.getDay() === 0 ? 6 : date.getDay() - 1]}
                </p>
                <p className={`text-sm tabular-nums ${isToday ? 'font-medium text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'}`}>
                  {date.getDate()}
                </p>
              </div>

              {/* Blackout indicator */}
              {isBlackout && (
                <div className="px-1.5 py-1 rounded bg-[oklch(1_0_0/0.03)] border border-dashed border-[oklch(1_0_0/0.08)]">
                  <p className="stage-micro text-center">Off</p>
                </div>
              )}

              {/* Gig cards */}
              {dayEntries.map((entry) => {
                const rate = formatRate(entry.pay_rate, entry.pay_rate_type, entry.scheduled_hours);
                return (
                  <button
                    key={entry.assignment_id}
                    type="button"
                    onClick={() => router.push(`/schedule/${entry.assignment_id}`)}
                    className={`
                      flex flex-col gap-0.5 p-1.5 rounded-md text-left
                      bg-[var(--stage-surface-elevated)] stage-hover overflow-hidden
                      border-l-2 ${STATUS_COLORS[entry.status] ?? 'border-l-[var(--stage-text-tertiary)]'}
                      cursor-pointer
                    `}
                  >
                    <p className="text-label font-medium text-[var(--stage-text-primary)] line-clamp-2 leading-tight">
                      {entry.event_title ?? 'Show'}
                    </p>
                    {entry.starts_at && (
                      <p className="text-micro tabular-nums text-[var(--stage-text-tertiary)]">
                        {formatTime(entry.starts_at)}
                      </p>
                    )}
                    {entry.venue_name && (
                      <p className="text-micro text-[var(--stage-text-tertiary)] truncate">
                        {entry.venue_name}
                      </p>
                    )}
                    {rate && (
                      <p className="text-micro tabular-nums text-[var(--stage-text-secondary)]">
                        {rate}
                      </p>
                    )}
                  </button>
                );
              })}

              {/* Empty day */}
              {dayEntries.length === 0 && !isBlackout && (
                <div className="flex-1 min-h-[40px]" />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: stacked day view (hidden on desktop) */}
      <div className="flex flex-col gap-3 lg:hidden">
        {days.map(({ date, dateStr }) => {
          const isToday = dateStr === todayStr;
          const isBlackout = blackoutSet.has(dateStr);
          const dayEntries = entryMap.get(dateStr) ?? [];
          if (dayEntries.length === 0 && !isBlackout && !isToday) return null;

          return (
            <div key={dateStr} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${isToday ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'}`}>
                  {format(date, 'EEE, MMM d')}
                </span>
                {isToday && (
                  <span className="stage-label text-[var(--stage-text-tertiary)]">Today</span>
                )}
                {isBlackout && (
                  <span className="stage-label text-[var(--stage-text-tertiary)]">Unavailable</span>
                )}
              </div>
              {dayEntries.map((entry) => {
                const rate = formatRate(entry.pay_rate, entry.pay_rate_type, entry.scheduled_hours);
                return (
                  <button
                    key={entry.assignment_id}
                    type="button"
                    onClick={() => router.push(`/schedule/${entry.assignment_id}`)}
                    className={`
                      flex items-center gap-3 p-3 rounded-xl text-left
                      bg-[var(--stage-surface-elevated)] stage-hover overflow-hidden
                      border-l-2 ${STATUS_COLORS[entry.status] ?? 'border-l-[var(--stage-text-tertiary)]'}
                      cursor-pointer
                    `}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                        {entry.event_title ?? 'Show'}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--stage-text-secondary)]">
                        {entry.starts_at && <span>{formatTime(entry.starts_at)}</span>}
                        {entry.venue_name && (
                          <>
                            <span className="text-[var(--stage-text-tertiary)]">·</span>
                            <span className="truncate">{entry.venue_name}</span>
                          </>
                        )}
                        {rate && (
                          <>
                            <span className="text-[var(--stage-text-tertiary)]">·</span>
                            <span className="tabular-nums">{rate}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-[var(--stage-text-tertiary)] shrink-0" />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

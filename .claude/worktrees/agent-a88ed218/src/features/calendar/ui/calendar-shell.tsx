'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { format, addMonths, subMonths, addWeeks, subWeeks, addYears, subYears } from 'date-fns';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Filter } from 'lucide-react';

const KEYCAP_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };
import type { CalendarEvent, EventStatus } from '@/features/calendar/model/types';
import type { CalendarViewType } from '@/features/calendar/lib/date-ranges';
import { MonthGrid } from '@/features/calendar/ui/grids/month-grid';
import { YearGrid } from '@/features/calendar/ui/grids/year-grid';
import { WeekGrid } from '@/features/calendar/ui/grids/week-grid';
import { BladeManager } from '@/features/calendar/ui/blades/blade-manager';

const EVENT_STATUSES: { value: EventStatus; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'hold', label: 'Hold' },
  { value: 'planned', label: 'Planned' },
  { value: 'cancelled', label: 'Cancelled' },
];

const VIEW_PARAM = 'view';
const DATE_PARAM = 'date';
const BLADE_PARAM = 'blade'; // when set, day blade is open for this date (prev/next only change date, not blade)
const EVENT_PARAM = 'event';
const VIEWS: { value: CalendarViewType; label: string }[] = [
  { value: 'year', label: 'Year' },
  { value: 'month', label: 'Month' },
  { value: 'week', label: 'Week' },
];

export interface CalendarShellProps {
  events: CalendarEvent[];
  initialView: CalendarViewType;
  initialDate: string; // YYYY-MM-DD
}

export function CalendarShell({ events, initialView, initialDate }: CalendarShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const [filterPosition, setFilterPosition] = useState<{ top: number; left: number } | null>(null);

  const view = (searchParams.get(VIEW_PARAM) as CalendarViewType) ?? initialView;
  const dateStr = searchParams.get(DATE_PARAM) ?? initialDate;
  const viewDate = new Date(dateStr + 'T12:00:00');
  const headerLabel =
    view === 'year'
      ? format(viewDate, 'yyyy')
      : view === 'week'
        ? `Week of ${format(viewDate, 'MMM d, yyyy')}`
        : format(viewDate, 'MMMM yyyy');

  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<Set<EventStatus>>(
    () => new Set(EVENT_STATUSES.map((s) => s.value))
  );
  const [withProjectOnly, setWithProjectOnly] = useState(false);
  const [withClientOnly, setWithClientOnly] = useState(false);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (!statusFilter.has(e.status)) return false;
      if (withProjectOnly && !e.projectTitle) return false;
      if (withClientOnly && !e.clientName) return false;
      return true;
    });
  }, [events, statusFilter, withProjectOnly, withClientOnly]);

  useEffect(() => {
    function handleClickOutside(ev: MouseEvent) {
      const target = ev.target as Node;
      if (
        filterRef.current?.contains(target) ||
        filterDropdownRef.current?.contains(target)
      ) {
        return;
      }
      setFilterOpen(false);
    }
    if (filterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [filterOpen]);

  useEffect(() => {
    if (filterOpen && filterButtonRef.current && typeof document !== 'undefined') {
      const rect = filterButtonRef.current.getBoundingClientRect();
      setFilterPosition({ top: rect.bottom + 6, left: rect.right - 224 });
    } else {
      setFilterPosition(null);
    }
  }, [filterOpen]);

  const setParams = useCallback(
    (updates: {
      view?: CalendarViewType;
      date?: string;
      blade?: string | null;
      event?: string | null;
    }) => {
      const next = new URLSearchParams(searchParams.toString());
      if (updates.view != null) next.set(VIEW_PARAM, updates.view);
      if (updates.date != null) next.set(DATE_PARAM, updates.date);
      if (updates.blade !== undefined) {
        if (updates.blade) next.set(BLADE_PARAM, updates.blade);
        else next.delete(BLADE_PARAM);
      }
      if (updates.event !== undefined) {
        if (updates.event) next.set(EVENT_PARAM, updates.event);
        else next.delete(EVENT_PARAM);
      }
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams]
  );

  const onViewChange = useCallback(
    (v: CalendarViewType) => setParams({ view: v }),
    [setParams]
  );

  const onMonthSelect = useCallback(
    (year: number, month: number) => {
      const d = `${year}-${String(month).padStart(2, '0')}-01`;
      setParams({ view: 'month', date: d });
    },
    [setParams]
  );

  const onDateSelect = useCallback(
    (year: number, month: number, day: number) => {
      const d = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      setParams({ view: 'month', date: d });
    },
    [setParams]
  );

  /** Open the day blade for this date (e.g. day number or "+N more" click). */
  const onOpenDayBlade = useCallback(
    (dateStr: string) => setParams({ blade: dateStr, event: null }),
    [setParams]
  );

  /** Navigate to Event Command Center (event pill click in month grid). */
  const goToCommandCenter = useCallback(
    (eventId: string) => {
      const path = eventId.startsWith('gig:')
        ? `/events/g/${eventId.slice(4)}`
        : `/events/${eventId}`;
      router.push(path);
    },
    [router]
  );

  const goPrev = useCallback(() => {
    let next: Date;
    if (view === 'year') next = subYears(viewDate, 1);
    else if (view === 'week') next = subWeeks(viewDate, 1);
    else next = subMonths(viewDate, 1);
    setParams({ date: format(next, 'yyyy-MM-dd'), blade: null, event: null });
  }, [view, viewDate, setParams]);

  const goNext = useCallback(() => {
    let next: Date;
    if (view === 'year') next = addYears(viewDate, 1);
    else if (view === 'week') next = addWeeks(viewDate, 1);
    else next = addMonths(viewDate, 1);
    setParams({ date: format(next, 'yyyy-MM-dd'), blade: null, event: null });
  }, [view, viewDate, setParams]);

  const toggleStatus = useCallback((status: EventStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden liquid-panel relative antialiased">
      {/* Grain overlay — Liquid Japandi: glass surfaces need subtle noise */}
      <div className="pointer-events-none absolute inset-0 z-0 grain-overlay rounded-2xl" aria-hidden />
      {/* Toolbar: nav + title + view selector + filter */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]/50 backdrop-blur-xl rounded-t-2xl shrink-0">
        <div className="flex items-center gap-2">
          <motion.button
            type="button"
            onClick={goPrev}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.04 }}
            transition={KEYCAP_SPRING}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            aria-label="Previous"
          >
            <ChevronLeft className="w-5 h-5" />
          </motion.button>
          <h1 className="text-xl md:text-3xl font-semibold tracking-tight text-ink min-w-[140px] md:min-w-[200px] text-center" style={{ letterSpacing: '-0.02em' }}>
            {headerLabel}
          </h1>
          <motion.button
            type="button"
            onClick={goNext}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.04 }}
            transition={KEYCAP_SPRING}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-[var(--glass-border)] overflow-hidden bg-ink/[0.03]">
            {VIEWS.map(({ value, label }) => (
              <motion.button
                key={value}
                type="button"
                onClick={() => onViewChange(value)}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: view === value ? 1 : 1.02 }}
                transition={KEYCAP_SPRING}
                className={`px-4 py-2.5 text-sm font-medium ${
                  view === value
                    ? 'bg-ink text-canvas'
                    : 'text-ink-muted hover:bg-[var(--glass-bg-hover)] hover:text-ink'
                }`}
              >
                {label}
              </motion.button>
            ))}
          </div>
          <div className="relative" ref={filterRef}>
            <motion.button
              ref={filterButtonRef}
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              whileTap={{ scale: 0.96 }}
              whileHover={{ scale: 1.02 }}
              transition={KEYCAP_SPRING}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border border-[var(--glass-border)] text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
                filterOpen
                  ? 'bg-ink text-canvas'
                  : 'bg-ink/[0.03] text-ink-muted hover:bg-[var(--glass-bg-hover)] hover:text-ink'
              }`}
              aria-label="Filter events"
              aria-expanded={filterOpen}
            >
              <Filter className="w-4 h-4" />
              Filter
            </motion.button>
            {filterOpen &&
              filterPosition &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={filterDropdownRef}
                  className="fixed z-[200] w-56 rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg)]/95 backdrop-blur-xl liquid-panel-nested p-3"
                  style={{ top: filterPosition.top, left: filterPosition.left }}
                  role="dialog"
                  aria-label="Filter events by status"
                >
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
                    Show status
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {EVENT_STATUSES.map(({ value, label }) => (
                      <label
                        key={value}
                        className="flex items-center gap-2 text-sm text-ink cursor-pointer hover:bg-[var(--glass-bg-hover)] rounded-lg px-2 py-1.5 -mx-2 -my-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={statusFilter.has(value)}
                          onChange={() => toggleStatus(value)}
                          className="rounded border-[var(--glass-border)] text-ink focus:ring-[var(--ring)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mt-3 mb-1.5">
                    Optional
                  </p>
                  <label className="flex items-center gap-2 text-sm text-ink cursor-pointer hover:bg-[var(--glass-bg-hover)] rounded-lg px-2 py-1.5 -mx-2 -my-0.5">
                    <input
                      type="checkbox"
                      checked={withProjectOnly}
                      onChange={(e) => setWithProjectOnly(e.target.checked)}
                      className="rounded border-[var(--glass-border)] text-ink focus:ring-[var(--ring)]"
                    />
                    With project only
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink cursor-pointer hover:bg-[var(--glass-bg-hover)] rounded-lg px-2 py-1.5 -mx-2 -my-0.5">
                    <input
                      type="checkbox"
                      checked={withClientOnly}
                      onChange={(e) => setWithClientOnly(e.target.checked)}
                      className="rounded border-[var(--glass-border)] text-ink focus:ring-[var(--ring)]"
                    />
                    With client only
                  </label>
                </div>,
                document.body
              )}
          </div>
        </div>
      </header>

      {/* Grid area — fills remaining height, scrolls when content overflows; year view uses overflow-visible so hover-expanded months aren't clipped */}
      <div
        className={`relative z-10 flex-1 min-h-0 p-4 md:p-6 bg-[var(--glass-bg)]/20 backdrop-blur-sm rounded-b-2xl flex flex-col ${
          view === 'year' ? 'overflow-visible' : 'overflow-auto'
        }`}
      >
        {view === 'month' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <MonthGrid
              events={filteredEvents}
              viewDate={viewDate}
              onEventClick={(event) => goToCommandCenter(event.id)}
              onDayClick={onOpenDayBlade}
            />
          </div>
        )}
        {view === 'year' && (
          <YearGrid
            events={filteredEvents}
            viewDate={viewDate}
            onMonthSelect={onMonthSelect}
            onDateSelect={onDateSelect}
            className="flex-1 min-h-0"
          />
        )}
        {view === 'week' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <WeekGrid
              events={filteredEvents}
              viewDate={viewDate}
              onEventClick={(_, dateStr) => onOpenDayBlade(dateStr)}
              onDayClick={onOpenDayBlade}
            />
          </div>
        )}
      </div>

      {/* Stacked Blade: Day drawer + Event Detail when ?date= and ?event= */}
      <BladeManager events={filteredEvents} />
    </div>
  );
}

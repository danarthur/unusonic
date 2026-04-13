'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, parseISO, isSameDay, addDays, subDays, startOfDay } from 'date-fns';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { CalendarEvent } from '@/features/calendar/model/types';
import { EventSummaryCard } from '@/features/calendar/ui/blades/event-summary-card';

const BLADE_PARAM = 'blade'; // day blade open for this date (view anchor stays in 'date')
const EVENT_PARAM = 'event';
const DRAWER_WIDTH = 400;
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
const springConfig = STAGE_MEDIUM;

export interface DayBladeProps {
  /** Current date from URL (YYYY-MM-DD). */
  date: string | null;
  /** All events in the current view range; we filter to the selected day. */
  events: CalendarEvent[];
  /** When set, scroll to and highlight this event; also used for EventDetailBlade. */
  eventId: string | null;
  /** Called when date changes so parent can clear eventId (close Level 2). */
  onDateChange?: (newDate: string) => void;
}

export function DayBlade({ date, events, eventId, onDateChange }: DayBladeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const eventRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  // Parse date first so callbacks can reference it
  let parsedDate: Date | null = null;
  if (date) {
    try {
      parsedDate = parseISO(date);
      if (Number.isNaN(parsedDate.getTime())) parsedDate = null;
    } catch {
      parsedDate = null;
    }
  }

  const dayEvents = !parsedDate
    ? []
    : events
        .filter((e) => isSameDay(new Date(e.start), parsedDate!))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const isToday = parsedDate ? isSameDay(parsedDate, new Date()) : false;

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(BLADE_PARAM);
    next.delete(EVENT_PARAM);
    router.replace(`${pathname}?${next.toString()}`);
  }, [pathname, router, searchParams]);

  const setDate = useCallback(
    (newDateStr: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set(BLADE_PARAM, newDateStr);
      next.delete(EVENT_PARAM);
      router.replace(`${pathname}?${next.toString()}`);
      onDateChange?.(newDateStr);
    },
    [pathname, router, searchParams, onDateChange]
  );

  const goPrev = useCallback(() => {
    if (!parsedDate) return;
    setDate(format(subDays(parsedDate, 1), 'yyyy-MM-dd'));
  }, [parsedDate, setDate]);

  const goNext = useCallback(() => {
    if (!parsedDate) return;
    setDate(format(addDays(parsedDate, 1), 'yyyy-MM-dd'));
  }, [parsedDate, setDate]);

  const goToday = useCallback(() => {
    setDate(format(startOfDay(new Date()), 'yyyy-MM-dd'));
  }, [setDate]);

  useEffect(() => {
    if (!eventId) return;
    const el = eventRefsMap.current.get(eventId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [eventId]);

  return (
    <motion.aside
      initial={{ x: DRAWER_WIDTH }}
      animate={{ x: 0 }}
      exit={{ x: DRAWER_WIDTH }}
      transition={springConfig}
      className="fixed top-0 right-0 z-50 h-screen w-[400px] max-w-[100vw] flex flex-col border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]/95 shadow-lg overflow-hidden antialiased"
      role="dialog"
      aria-label="Day details"
    >
      {/* Sticky header: Date Stripper */}
      <div className="shrink-0 flex flex-col border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface)]/50">
        <div className="flex items-start justify-between gap-4 p-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-[var(--stage-text-primary)]" style={{ letterSpacing: '-0.02em' }}>
              {parsedDate ? format(parsedDate, 'EEEE, MMM d') : 'Day'}
            </h2>
            {parsedDate && (
              <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">{format(parsedDate, 'yyyy')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            aria-label="Close"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
        {/* < Prev [Today] Next > */}
        <div className="flex items-center justify-center gap-2 px-4 pb-4">
          <button
            type="button"
            onClick={goPrev}
            className="p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            aria-label="Previous day"
          >
            <span className="text-sm font-medium">&lt;</span>
          </button>
          <button
            type="button"
            onClick={goToday}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ${
              isToday
                ? 'bg-[var(--stage-accent)] text-[oklch(0.10_0_0)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={goNext}
            className="p-2 rounded-xl text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] stage-hover overflow-hidden transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            aria-label="Next day"
          >
            <span className="text-sm font-medium">&gt;</span>
          </button>
        </div>
      </div>

      {/* Body: event list with stagger */}
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
        {dayEvents.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={springConfig}
            className="text-sm text-[var(--stage-text-secondary)]/50 py-16 text-center tracking-wide"
          >
            No events scheduled
          </motion.p>
        ) : (
          dayEvents.map((event, i) => (
            <motion.div
              key={event.id}
              ref={(node) => {
                if (node) eventRefsMap.current.set(event.id, node);
              }}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, ...springConfig }}
            >
              <EventSummaryCard event={event} isFocused={eventId === event.id} />
            </motion.div>
          ))
        )}
      </div>
    </motion.aside>
  );
}

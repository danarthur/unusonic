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
const springConfig = { type: 'spring' as const, stiffness: 300, damping: 30 };
const KEYCAP_SPRING = { type: 'spring' as const, stiffness: 300, damping: 30 };

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
      className="fixed top-0 right-0 z-50 h-screen w-[400px] max-w-[100vw] flex flex-col border-l border-[var(--glass-border)] bg-[var(--glass-bg)]/95 backdrop-blur-2xl shadow-[var(--glass-shadow)] overflow-hidden antialiased"
      role="dialog"
      aria-label="Day details"
    >
      {/* Sticky header: Date Stripper */}
      <div className="shrink-0 flex flex-col border-b border-[var(--glass-border)] bg-[var(--glass-bg)]/50 backdrop-blur-md">
        <div className="flex items-start justify-between gap-4 p-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink" style={{ letterSpacing: '-0.02em' }}>
              {parsedDate ? format(parsedDate, 'EEEE, MMM d') : 'Day'}
            </h2>
            {parsedDate && (
              <p className="text-sm text-ink-muted mt-0.5">{format(parsedDate, 'yyyy')}</p>
            )}
          </div>
          <motion.button
            type="button"
            onClick={close}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.04 }}
            transition={KEYCAP_SPRING}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </motion.button>
        </div>
        {/* < Prev [Today] Next > */}
        <div className="flex items-center justify-center gap-2 px-4 pb-4">
          <motion.button
            type="button"
            onClick={goPrev}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.04 }}
            transition={KEYCAP_SPRING}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            aria-label="Previous day"
          >
            <span className="text-sm font-medium">&lt;</span>
          </motion.button>
          <motion.button
            type="button"
            onClick={goToday}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.02 }}
            transition={KEYCAP_SPRING}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ring)] ${
              isToday
                ? 'bg-ink text-canvas'
                : 'text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)]'
            }`}
          >
            Today
          </motion.button>
          <motion.button
            type="button"
            onClick={goNext}
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.04 }}
            transition={KEYCAP_SPRING}
            className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
            aria-label="Next day"
          >
            <span className="text-sm font-medium">&gt;</span>
          </motion.button>
        </div>
      </div>

      {/* Body: event list with stagger */}
      <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
        {dayEvents.length === 0 ? (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={springConfig}
            className="text-sm text-ink-muted py-8 text-center"
          >
            No events this day
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

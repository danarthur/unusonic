'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { format, parseISO, isSameDay } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { CalendarEvent } from '@/features/calendar/model/types';
import { EventCard } from '@/features/calendar/ui/components/event-card';

const DRAWER_WIDTH = 400;
const springConfig = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface DayBladeProps {
  /** Current date from URL (YYYY-MM-DD). When set, blade is open. */
  date: string | null;
  /** All events in the current view range; we filter to the selected day. */
  events: CalendarEvent[];
  /** When set (e.g. from event pill click), scroll to and highlight this event. */
  focusEventId?: string | null;
}

export function DayBlade({ date, events, focusEventId }: DayBladeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const eventRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

  const close = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('date');
    next.delete('event');
    router.replace(`${pathname}?${next.toString()}`);
  }, [pathname, router, searchParams]);

  const isOpen = Boolean(date);
  let parsedDate: Date | null = null;
  if (date) {
    try {
      parsedDate = parseISO(date);
      if (Number.isNaN(parsedDate.getTime())) parsedDate = null;
    } catch {
      parsedDate = null;
    }
  }

  const dayEvents = useCallback(() => {
    if (!parsedDate) return [];
    return events
      .filter((e) => isSameDay(new Date(e.start), parsedDate!))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [parsedDate, events])();

  // When opening to a specific event, scroll it into view and briefly highlight
  useEffect(() => {
    if (!focusEventId || !isOpen) return;
    const el = eventRefsMap.current.get(focusEventId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [focusEventId, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && parsedDate && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-obsidian/40 backdrop-blur-xl"
            onClick={close}
            aria-hidden
          />

          {/* Drawer */}
          <motion.aside
            initial={{ x: DRAWER_WIDTH }}
            animate={{ x: 0 }}
            exit={{ x: DRAWER_WIDTH }}
            transition={springConfig}
            className="fixed top-0 right-0 z-50 h-screen w-[400px] max-w-[100vw] flex flex-col border-l border-[var(--glass-border)] bg-[var(--glass-bg)]/95 backdrop-blur-2xl shadow-[var(--glass-shadow)] overflow-hidden antialiased"
            role="dialog"
            aria-label="Day details"
          >
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between gap-4 p-6 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]/50 backdrop-blur-md">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-ink">
                  {format(parsedDate, 'EEEE, MMM d')}
                </h2>
                <p className="text-sm text-ink-muted mt-0.5">
                  {format(parsedDate, 'yyyy')}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-2 rounded-xl text-ink-muted hover:text-ink hover:bg-[var(--glass-bg-hover)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body: chronological events */}
            <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
              {dayEvents.length === 0 ? (
                <p className="text-sm text-ink-muted py-8 text-center">
                  No events this day
                </p>
              ) : (
                dayEvents.map((event) => (
                  <div
                    key={event.id}
                    ref={(node) => {
                      if (node) eventRefsMap.current.set(event.id, node);
                    }}
                    className={focusEventId === event.id ? 'ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-canvas rounded-xl transition-[box-shadow] duration-300' : undefined}
                  >
                    <EventCard event={event} />
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

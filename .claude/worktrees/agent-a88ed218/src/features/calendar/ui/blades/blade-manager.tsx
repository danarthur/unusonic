'use client';

import { useCallback } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { CalendarEvent } from '@/features/calendar/model/types';
import { DayBlade } from '@/features/calendar/ui/blades/day-blade';
import { EventDetailBlade } from '@/features/calendar/ui/blades/event-detail-blade';

const BLADE_PARAM = 'blade'; // day blade open for this date (separate from view anchor 'date')
const EVENT_PARAM = 'event';

export interface BladeManagerProps {
  /** All events in the current view range; DayBlade filters to the selected day. */
  events: CalendarEvent[];
}

/**
 * Stacked Blade manager: watches searchParams.
 * - ?blade=YYYY-MM-DD → DayBlade (Level 1). Prev/next only change date, not blade.
 * - ?blade=...&event=... → DayBlade + EventDetailBlade on top (Level 2).
 */
export function BladeManager({ events }: BladeManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const bladeDate = searchParams.get(BLADE_PARAM);
  const eventId = searchParams.get(EVENT_PARAM);

  const isDayBladeOpen = Boolean(bladeDate);
  const isEventDetailOpen = Boolean(bladeDate && eventId);

  const closeBlades = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete(BLADE_PARAM);
    next.delete(EVENT_PARAM);
    router.replace(`${pathname}?${next.toString()}`);
  }, [pathname, router, searchParams]);

  return (
    <AnimatePresence>
      {isDayBladeOpen && (
        <>
          {/* Backdrop: click to close both blades */}
          <motion.div
            key="blade-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            className="fixed inset-0 z-40 bg-obsidian/40 backdrop-blur-xl"
            onClick={closeBlades}
            onKeyDown={(e) => e.key === 'Escape' && closeBlades()}
            role="button"
            tabIndex={0}
            aria-label="Close panels"
          />

          {/* Level 1: Day Blade */}
          <DayBlade
            key={`day-${bladeDate}`}
            date={bladeDate}
            events={events}
            eventId={eventId}
          />

          {/* Level 2: Event Detail Blade (on top, ~95% of DayBlade width) */}
          <AnimatePresence>
            {isEventDetailOpen && eventId && (
              <EventDetailBlade key={`event-${eventId}`} eventId={eventId} />
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}

'use client';

import Link from 'next/link';
import type { CalendarEvent } from '@/features/calendar/model/types';
import { EventCard } from '@/features/calendar/ui/components/event-card';

function commandCenterPath(eventId: string): string {
  return eventId.startsWith('gig:')
    ? `/events/g/${eventId.slice(4)}`
    : `/events/${eventId}`;
}

export interface EventSummaryCardProps {
  event: CalendarEvent;
  /** When set, card shows focus ring. */
  isFocused?: boolean;
}

/**
 * Clickable event card used in Day Blade list. Navigates to Event Command Center.
 */
export function EventSummaryCard({ event, isFocused }: EventSummaryCardProps) {
  const href = commandCenterPath(event.id);

  return (
    <Link
      href={href}
      className={`block w-full text-left rounded-xl transition-[box-shadow] duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 focus:ring-offset-canvas ${
        isFocused ? 'ring-2 ring-[var(--ring)] ring-offset-2 ring-offset-canvas' : ''
      }`}
    >
      <EventCard event={event} />
    </Link>
  );
}

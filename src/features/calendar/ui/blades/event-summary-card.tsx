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
 * Clickable event card used in Day Blade list. Navigates to Event Studio.
 */
export function EventSummaryCard({ event, isFocused }: EventSummaryCardProps) {
  const href = commandCenterPath(event.id);

  return (
    <Link
      href={href}
      className={`block w-full text-left rounded-xl transition-[box-shadow] duration-300 focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[oklch(0.10_0_0)] ${
        isFocused ? 'ring-2 ring-[var(--stage-accent)] ring-offset-2 ring-offset-[oklch(0.10_0_0)]' : ''
      }`}
    >
      <EventCard event={event} />
    </Link>
  );
}

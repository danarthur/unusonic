/**
 * Calendar feature - DTOs and derived fields
 * Based on public.events table. Status uses event_status enum strictly.
 * @module features/calendar/model/types
 */

// =============================================================================
// Event status – must match Database['public']['Enums']['event_status']
// =============================================================================

export type EventStatus = 'confirmed' | 'hold' | 'cancelled' | 'planned';

// =============================================================================
// Color token derived from status (Tailwind / design system)
// =============================================================================

export type CalendarEventColor = 'emerald' | 'amber' | 'rose' | 'blue';

const STATUS_TO_COLOR: Record<EventStatus, CalendarEventColor> = {
  confirmed: 'emerald',
  hold: 'amber',
  cancelled: 'rose',
  planned: 'blue',
};

/**
 * Maps event_status to a display color.
 * confirmed -> emerald, hold -> amber, cancelled -> rose, planned -> blue (default).
 */
export function getEventColor(status: EventStatus): CalendarEventColor {
  return STATUS_TO_COLOR[status] ?? 'blue';
}

// =============================================================================
// Calendar event DTO (dates as ISO strings for RSC serialization)
// =============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  /** Mapped from events.starts_at (ISO string) */
  start: string;
  /** Mapped from events.ends_at (ISO string) */
  end: string;
  status: EventStatus;
  /** Joined from projects.name */
  projectTitle: string | null;
  /** From events.location_name */
  location: string | null;
  /** Derived color from status */
  color: CalendarEventColor;
  workspaceId: string;
  /** @deprecated Unification: use event id; kept for backward compat. */
  gigId: string | null;
  /** From gigs.client_name or clients.name when linked to a gig; use as subtitle in UI. */
  clientName: string | null;
}

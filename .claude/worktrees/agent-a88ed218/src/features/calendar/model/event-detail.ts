/**
 * Event detail DTO for the Event Detail Blade.
 * Extends calendar event with optional dossier data (crew, guests, project, lead).
 * @module features/calendar/model/event-detail
 */

import type { EventStatus } from '@/features/calendar/model/types';
import type { CalendarEventColor } from '@/features/calendar/model/types';

export interface EventDetailDTO {
  id: string;
  title: string;
  start: string;
  end: string;
  status: EventStatus;
  projectTitle: string | null;
  projectId: string | null;
  location: string | null;
  color: CalendarEventColor;
  workspaceId: string;
  /** When event is linked to a gig; use for Deal room link. */
  gigId: string | null;
  /** Optional: crew count when available from DB. */
  crewCount: number;
  /** Optional: guest count when available from DB. */
  guestCount: number;
  /** Optional: lead contact for "Contact Lead" action. */
  leadContact: string | null;
  /** Optional: timeline / run of show status. */
  timelineStatus: string | null;
}

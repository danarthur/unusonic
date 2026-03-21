/**
 * Calendar feature - Universal Calendar data layer
 * @module features/calendar
 *
 * Public API:
 * - Server Action: import { getCalendarEvents } from '@/features/calendar/api/get-events'
 * - Date ranges & types (safe for client): see exports below
 */

export {
  getRangeForView,
  getRangeForYear,
  getRangeForMonth,
  getRangeForWeek,
  getRangeForDay,
  type DateRange,
  type CalendarViewType,
} from './lib/date-ranges';
export type {
  CalendarEvent,
  EventStatus,
  CalendarEventColor,
} from './model/types';
export { getEventColor } from './model/types';

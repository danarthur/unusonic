/**
 * Calendar date range helpers (date-fns)
 * Computes fetch ranges for year/month/week with ±7 day buffer for smooth transitions.
 * @module features/calendar/lib/date-ranges
 */

import {
  startOfYear,
  endOfYear,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  subDays,
  addDays,
  type Locale,
} from 'date-fns';

export type CalendarViewType = 'year' | 'month' | 'week' | 'day';

const BUFFER_DAYS = 7;

// =============================================================================
// Range result (ISO strings for API)
// =============================================================================

export interface DateRange {
  start: string;
  end: string;
}

// =============================================================================
// Helpers
// =============================================================================

function withBuffer(start: Date, end: Date): DateRange {
  return {
    start: subDays(start, BUFFER_DAYS).toISOString(),
    end: addDays(end, BUFFER_DAYS).toISOString(),
  };
}

/**
 * Start of week (Monday) – use default locale or pass one for i18n.
 */
function weekStart(date: Date, locale?: Locale): Date {
  return startOfWeek(date, { weekStartsOn: 1, locale });
}

/**
 * End of week (Sunday).
 */
function weekEnd(date: Date, locale?: Locale): Date {
  return endOfWeek(date, { weekStartsOn: 1, locale });
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Returns the fetch range for a year view.
 * Range: start of year → end of year, with -7 / +7 day buffer.
 */
export function getRangeForYear(viewDate: Date, _locale?: Locale): DateRange {
  const start = startOfYear(viewDate);
  const end = endOfYear(viewDate);
  return withBuffer(start, end);
}

/**
 * Returns the fetch range for a month view.
 * Range: start of month → end of month, with -7 / +7 day buffer.
 */
export function getRangeForMonth(viewDate: Date, _locale?: Locale): DateRange {
  const start = startOfMonth(viewDate);
  const end = endOfMonth(viewDate);
  return withBuffer(start, end);
}

/**
 * Returns the fetch range for a week view.
 * Week starts Monday. Range: start of week → end of week, with -7 / +7 day buffer.
 */
export function getRangeForWeek(viewDate: Date, locale?: Locale): DateRange {
  const start = weekStart(viewDate, locale);
  const end = weekEnd(viewDate, locale);
  return withBuffer(start, end);
}

/**
 * Returns the fetch range for a day view.
 * Range: start of day → end of day, with -7 / +7 day buffer.
 */
export function getRangeForDay(viewDate: Date, _locale?: Locale): DateRange {
  const start = startOfDay(viewDate);
  const end = endOfDay(viewDate);
  return withBuffer(start, end);
}

/**
 * Returns the fetch range for the given view with ±7 day buffer.
 * @param date - View date (anchor for the range)
 * @param view - 'year' | 'month' | 'week' | 'day'
 * @returns { start: string, end: string } in ISO format
 */
export function getRangeForView(
  date: Date,
  view: CalendarViewType,
  locale?: Locale
): DateRange {
  switch (view) {
    case 'year':
      return getRangeForYear(date, locale);
    case 'month':
      return getRangeForMonth(date, locale);
    case 'week':
      return getRangeForWeek(date, locale);
    case 'day':
      return getRangeForDay(date, locale);
    default:
      return getRangeForMonth(date, locale);
  }
}

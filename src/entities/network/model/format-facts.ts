/**
 * How a fact reads, wherever it is shown.
 *
 * Shared so a date or an amount cannot render one way on a card and another way
 * on a row. Most of a day's worth of bugs on this page were two surfaces
 * answering the same question differently, and formatting is the cheapest place
 * for that to happen again.
 *
 * @module entities/network/model/format-facts
 */

const MS_PER_DAY = 86_400_000;

export function formatUsd(amount: number): string {
  return `$${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * A show date and how precise it is.
 *
 * The two sources genuinely differ and must be formatted differently.
 * `deals.proposed_date` is a date column -- "2026-11-01" parses to midnight UTC,
 * and formatting that in local time renders "Oct 31" for everyone west of
 * Greenwich, showing every proposed date a day early. `ops.events.starts_at` is
 * a real timestamp: a show at 8pm Pacific is the next day in UTC, so forcing
 * that one to UTC breaks it in the opposite direction. Neither timezone is
 * right for both, so each carries its own.
 */
export type ShowDate = { at: Date; calendarOnly: boolean };

export function parseShowDate(iso: string | null | undefined): ShowDate | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return { at, calendarOnly: /^\d{4}-\d{2}-\d{2}$/.test(iso) };
}

/** The zone a given show date must be read in to name the right day. */
function zoneOf({ calendarOnly }: ShowDate): 'UTC' | undefined {
  return calendarOnly ? 'UTC' : undefined;
}

function yearOf(show: ShowDate): number {
  return show.calendarOnly ? show.at.getUTCFullYear() : show.at.getFullYear();
}

/** "Aug 16", or "Aug 16, 2025" once the year stops being obvious. */
export function formatDay(show: ShowDate, now: Date): string {
  const withYear = yearOf(show) !== now.getFullYear();
  return show.at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: zoneOf(show),
  });
}

/**
 * Near-future dates read as weekdays because that is how the question is asked
 * -- "can he do Saturday" -- and "Sat" is shorter and lands faster than a date.
 */
export function formatUpcoming(show: ShowDate, now: Date): string {
  const days = (show.at.getTime() - now.getTime()) / MS_PER_DAY;
  if (days > 6) return formatDay(show, now);
  return show.at.toLocaleDateString('en-US', { weekday: 'short', timeZone: zoneOf(show) });
}

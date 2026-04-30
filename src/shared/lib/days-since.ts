/**
 * Day-difference helpers, consolidated from three near-duplicate
 * implementations (audit, 2026-04-29). All callers historically computed
 * `Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)` with
 * subtle differences in how they handled invalid dates and future dates;
 * those differences are now explicit at the call site.
 *
 * Pick the helper whose contract matches your read-vs-clamp expectation.
 */

const ONE_DAY_MS = 86_400_000;

/**
 * Whole days since a past date. Clamps at 0 (future dates return 0).
 * Returns `null` for invalid input.
 *
 * Use when "negative days" is meaningless for the surface — e.g. "no reply
 * since N days ago" pills, "waiting for N days" badges. Caller is expected
 * to null-check (or ?? 0).
 */
export function daysSince(date: string | Date): number | null {
  const ms = new Date(date).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / ONE_DAY_MS));
}

/**
 * Whole days between a date and now, allowing negative for future dates.
 * Returns 0 for invalid input (rather than NaN, which silently corrupts
 * downstream arithmetic).
 *
 * Use when the sign matters — e.g. ranking activity by recency where the
 * caller might pass a forward-looking date.
 */
export function daysFrom(date: string | Date): number {
  const ms = new Date(date).getTime();
  if (Number.isNaN(ms)) return 0;
  return Math.floor((Date.now() - ms) / ONE_DAY_MS);
}

/**
 * Client-safe timezone utilities.
 *
 * Lives separately from `timezone.ts` because that file imports the server-only
 * Supabase client at the top level (for `resolveEventTimezone`), which would
 * pull the server runtime into any client component that imports a helper.
 * Pure helpers go here so client widgets can format event dates correctly
 * without dragging the server bundle in.
 *
 * @see ./timezone.ts for server-side resolution helpers (resolveEventTimezone, etc.)
 */

const IANA_RE = /^[A-Za-z]+\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)?$/;

/** Returns true if the string is a valid IANA timezone identifier (or 'UTC'). */
export function isValidIANA(tz: string): boolean {
  if (tz === 'UTC') return true;
  if (!IANA_RE.test(tz)) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Returns the viewer's IANA timezone from the browser. Client-only. */
export function getViewerTimezone(): string {
  if (typeof Intl === 'undefined') return 'UTC';
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

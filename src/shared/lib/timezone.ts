/**
 * Shared timezone utilities for event production.
 *
 * Resolution order (R6 §4.2): explicit payload → venue attrs → workspace → 'UTC'.
 * All server-side. Client-side viewer tz via getViewerTimezone().
 *
 * @see docs/reference/code/archive/event-timezone-storage-research.md
 */

import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { createClient } from '@/shared/api/supabase/server';
import { VENUE_ATTR } from '@/entities/directory/model/attribute-keys';

// ─── IANA validation ─────────────────────────────────────────────────────────

const IANA_RE = /^[A-Za-z]+\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)?$/;

/** Returns true if the string is a valid IANA timezone identifier (or 'UTC'). */
export function isValidIANA(tz: string): boolean {
  if (tz === 'UTC') return true;
  if (!IANA_RE.test(tz)) return false;
  // Double-check against Intl — catches typos like "America/New_Yrok"
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ─── Server-side resolution ──────────────────────────────────────────────────

type ResolveParams = {
  /** Explicit timezone from the handoff payload (highest priority). */
  payload?: string | null;
  /** Venue entity ID — will be looked up for attributes.timezone. */
  venueId?: string | null;
  /** Workspace ID — fallback to workspaces.timezone. */
  workspaceId: string;
};

/**
 * Resolve the IANA timezone for an event. Server-only (reads from DB).
 *
 * Resolution order: explicit payload → venue attributes.timezone → workspace.timezone → 'UTC'.
 */
export async function resolveEventTimezone({
  payload,
  venueId,
  workspaceId,
}: ResolveParams): Promise<string> {
  // 1. Explicit payload wins
  if (payload && isValidIANA(payload)) return payload;

  const supabase = await createClient();

  // 2. Venue entity attributes.timezone
  if (venueId) {
    const { data: venue } = await supabase
      .schema('directory')
      .from('entities')
      .select('attributes')
      .eq('id', venueId)
      .maybeSingle();

    const venueTz = (venue?.attributes as Record<string, unknown> | null)?.[VENUE_ATTR.timezone];
    if (typeof venueTz === 'string' && isValidIANA(venueTz)) return venueTz;
  }

  // 3. Workspace fallback
  const { data: ws } = await supabase
    .from('workspaces')
    .select('timezone')
    .eq('id', workspaceId)
    .maybeSingle();

  const wsTz = (ws as { timezone?: string } | null)?.timezone;
  if (typeof wsTz === 'string' && isValidIANA(wsTz)) return wsTz;

  // 4. Ultimate fallback
  return 'UTC';
}

// ─── Conversion helpers ──────────────────────────────────────────────────────

/**
 * Convert a local date + time in a venue's timezone to a UTC ISO string.
 *
 * Example: toVenueInstant('2026-06-15', '08:00', 'America/Los_Angeles')
 *          → '2026-06-15T15:00:00.000Z'  (8am PDT = 15:00 UTC)
 */
export function toVenueInstant(dateStr: string, timeStr: string, tz: string): string {
  return fromZonedTime(`${dateStr}T${timeStr}:00`, tz).toISOString();
}

/**
 * Format a UTC instant in the venue's local timezone.
 *
 * Example: formatInVenueTz('2026-06-15T15:00:00.000Z', 'America/Los_Angeles', 'h:mm a z')
 *          → '8:00 AM PDT'
 */
export function formatInVenueTz(instant: string | Date, tz: string, pattern: string): string {
  return formatInTimeZone(instant, tz, pattern);
}

// ─── Client-side helper ──────────────────────────────────────────────────────

/** Returns the viewer's IANA timezone from the browser. Client-only. */
export function getViewerTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

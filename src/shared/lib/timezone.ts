/**
 * Shared timezone utilities for event production.
 *
 * Resolution order: explicit payload → venue attrs → workspace → SAFE_FALLBACK_TZ.
 * All server-side. Client-side viewer tz via getViewerTimezone().
 *
 * @see docs/reference/code/archive/event-timezone-storage-research.md
 */

import { fromZonedTime, formatInTimeZone } from 'date-fns-tz';
import { createClient } from '@/shared/api/supabase/server';
import { VENUE_ATTR } from '@/entities/directory/model/attribute-keys';
import { isValidIANA, getViewerTimezone } from './timezone-client';

// Re-export client-safe helpers so existing server callers keep working without
// pulling them out of this module (they live in timezone-client.ts to avoid
// dragging the server Supabase client into client bundles).
export { isValidIANA, getViewerTimezone };

/**
 * Last-resort fallback when no upstream source supplies a real IANA timezone.
 *
 * Why not 'UTC'? Because `ops.events.timezone` and `public.workspaces.timezone`
 * both default to 'UTC' at the column level (migration 20260412030000), and
 * stale handoffs leave production rows stamped with that default. Surfacing
 * "4pm UTC" to a US-based owner is wrong; falling back to a sane US wall-clock
 * zone is the least-surprising behaviour. Owners with non-US shows always set
 * an explicit venue/workspace tz, so this fallback only fires for the
 * misconfigured-default case.
 *
 * Mirrors `SAFE_FALLBACK_TZ` in src/app/api/aion/lib/build-event-scope-prefix.ts —
 * both writers (handoverDeal, gig actions) and readers (Aion brief) now share
 * the same final fallback so an event's stored tz matches what gets surfaced.
 */
export const SAFE_FALLBACK_TZ = 'America/Los_Angeles';

// ─── Server-side resolution ──────────────────────────────────────────────────

type ResolveParams = {
  /**
   * Explicit timezone from the handoff payload (highest priority). 'UTC' is
   * treated as a sentinel here, not a deliberate user choice — see the body
   * of resolveEventTimezone for why.
   */
  payload?: string | null;
  /** Venue entity ID — will be looked up for attributes.timezone. */
  venueId?: string | null;
  /** Workspace ID — fallback to workspaces.timezone. */
  workspaceId: string;
};

/**
 * Returns the input when it's a real IANA timezone we should accept; null
 * otherwise. Centralizes the "skip 'UTC' sentinel" rule so each step in
 * resolveEventTimezone reads as a single conditional.
 */
function asRealIana(candidate: unknown): string | null {
  if (typeof candidate !== 'string') return null;
  if (candidate === 'UTC') return null;
  return isValidIANA(candidate) ? candidate : null;
}

/**
 * Workspace-bootstrap helper: coerce caller-supplied IANA timezone to a value
 * that satisfies the `workspaces_timezone_iana` CHECK and is NOT the 'UTC'
 * default sentinel. Falls back to `SAFE_FALLBACK_TZ` when input is missing,
 * malformed, or explicitly 'UTC' — see Guardian risk 3 in
 * docs/audits/handover-pipeline-pr1-guardian-2026-05-07.md for why we'd
 * rather burn LA than burn 'UTC' on a fresh workspace.
 *
 * Browser's IANA timezone is the best available signal at workspace creation.
 * Owners can override later in settings; for now we just write what the
 * browser reports and never let 'UTC' sneak past.
 */
export function resolveWorkspaceTimezone(candidate: unknown): string {
  return asRealIana(candidate) ?? SAFE_FALLBACK_TZ;
}

/**
 * Resolve the IANA timezone for an event. Server-only (reads from DB).
 *
 * Resolution order:
 *   1. explicit payload (skip 'UTC' sentinel)
 *   2. venue entity attributes.timezone (skip 'UTC' sentinel)
 *   3. workspace.timezone (skip 'UTC' sentinel)
 *   4. SAFE_FALLBACK_TZ
 *
 * Why 'UTC' is a sentinel at every step: both `ops.events.timezone` and
 * `public.workspaces.timezone` have `DEFAULT 'UTC' NOT NULL`. A row stamped
 * 'UTC' typically means "column default, nobody set it" rather than "the
 * event genuinely runs on UTC wall clock". This matches the Aion brief
 * generator chain in `src/app/api/aion/lib/build-event-scope-prefix.ts` so
 * writers (handoverDeal) and readers (brief) agree on which value to use.
 */
export async function resolveEventTimezone({
  payload,
  venueId,
  workspaceId,
}: ResolveParams): Promise<string> {
  // 1. Explicit payload — only accept a non-UTC IANA value. A stale wizard
  //    payload carrying the column default would otherwise short-circuit the
  //    whole chain and re-stamp 'UTC' onto a fresh row.
  const fromPayload = asRealIana(payload);
  if (fromPayload) return fromPayload;

  const supabase = await createClient();

  // 2. Venue entity attributes.timezone — same 'UTC' sentinel skip.
  if (venueId) {
    const { data: venue } = await supabase
      .schema('directory')
      .from('entities')
      .select('attributes')
      .eq('id', venueId)
      .maybeSingle();

    const venueTz = (venue?.attributes as Record<string, unknown> | null)?.[VENUE_ATTR.timezone];
    const fromVenue = asRealIana(venueTz);
    if (fromVenue) return fromVenue;
  }

  // 3. Workspace fallback — skip 'UTC' for the same reason as steps 1/2.
  const { data: ws } = await supabase
    .from('workspaces')
    .select('timezone')
    .eq('id', workspaceId)
    .maybeSingle();

  const fromWorkspace = asRealIana((ws as { timezone?: string } | null)?.timezone);
  if (fromWorkspace) return fromWorkspace;

  // 4. Ultimate fallback — see SAFE_FALLBACK_TZ JSDoc for why we don't return 'UTC'.
  return SAFE_FALLBACK_TZ;
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

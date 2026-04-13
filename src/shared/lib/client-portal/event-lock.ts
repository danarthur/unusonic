/**
 * Event lock state for client-portal song requests.
 *
 * Single source of truth for whether a couple can still add/edit/delete
 * song requests on an event. Both the SQL layer (each `client_songs_*`
 * RPC) and the TypeScript layer (route handlers + `getClientSongsPageData`)
 * must agree on this logic, or the two will drift and produce confusing
 * "the button is enabled but the API rejects" states.
 *
 * Amended 2026-04-10 per research-team A1: the original 24-hour show-day
 * cutoff was killed. Couple requests stay open until the event's status
 * flips to `in_progress` / `completed` / `cancelled` / `archived`. Entries
 * submitted inside the final 24 hours are stamped `is_late_add: true` by
 * the RPC and the DJ sees a "late requests" chip, but the couple side
 * never hits a hard door.
 *
 * See `docs/reference/client-portal-songs-design.md` §0 A1 + §4.5.
 *
 * **Pure function, no DB access.** Safe to call from client components,
 * server components, and route handlers alike. Does NOT import 'server-only'.
 *
 * @module shared/lib/client-portal/event-lock
 */

/**
 * Why the event is locked, if it is. Null when `locked === false`.
 *
 * - `show_live` — event status is `in_progress`. Show is happening right now.
 * - `completed` — event is over. Read-only.
 * - `cancelled` — event was cancelled.
 * - `archived` — event was archived (per invariant §14.6(4) 18-month TTL).
 *
 * Explicitly NOT a reason: the original `show_day` (T-24h cutoff) was
 * removed in A1. If you see `show_day` anywhere in the codebase after
 * 2026-04-11, it's a regression — delete it.
 */
export type EventLockReason = 'show_live' | 'completed' | 'cancelled' | 'archived' | null;

export type EventLockState = {
  locked: boolean;
  reason: EventLockReason;
};

/**
 * Statuses that block couple mutations. Exported so the RPC body's PL/pgSQL
 * mirror can be sanity-checked against this list in a pgTAP helper.
 */
export const LOCKING_EVENT_STATUSES: readonly string[] = [
  'in_progress',
  'completed',
  'cancelled',
  'archived',
] as const;

/**
 * Compute the lock state for an event given its `status` column.
 *
 * `startsAt` is accepted as an argument for forward compatibility with the
 * reserved `workspaces.song_request_lock_hours_before` vendor setting (the
 * read path of which ships in slice 13). For today the only time-based
 * lock is "show is live" which we infer from status, not from starts_at.
 *
 * Unknown/null status defaults to **unlocked** — prefer permissive on the
 * read side; the RPC is the enforcement layer. If the status column is
 * missing we'd rather let the couple try to add a song and see a friendly
 * server-side rejection than silently hide the UI.
 *
 * @example
 *   computeEventLock(new Date().toISOString(), 'planned')      → { locked: false, reason: null }
 *   computeEventLock(new Date().toISOString(), 'in_progress')  → { locked: true,  reason: 'show_live' }
 *   computeEventLock(new Date().toISOString(), 'completed')    → { locked: true,  reason: 'completed' }
 */
export function computeEventLock(
  _startsAt: string | null,
  status: string | null,
): EventLockState {
  if (!status) return { locked: false, reason: null };

  switch (status) {
    case 'in_progress':
      return { locked: true, reason: 'show_live' };
    case 'completed':
      return { locked: true, reason: 'completed' };
    case 'cancelled':
      return { locked: true, reason: 'cancelled' };
    case 'archived':
      return { locked: true, reason: 'archived' };
    default:
      return { locked: false, reason: null };
  }
}

/**
 * Is this song entry a "late add" — submitted inside the final 24 hours
 * before the event? Used as a DJ-side triage signal (not a lock).
 *
 * RPCs stamp `is_late_add: true` on the stored row when the add was made
 * inside this window; this helper is the TypeScript mirror for any
 * server-side computation that needs to label on the fly.
 */
export function isWithinLateAddWindow(
  startsAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!startsAt) return false;
  const starts = new Date(startsAt).getTime();
  if (Number.isNaN(starts)) return false;
  const diffMs = starts - now.getTime();
  return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
}

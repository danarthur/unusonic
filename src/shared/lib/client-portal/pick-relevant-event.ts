/**
 * Pick the "most relevant" event for a client portal view.
 *
 * Extracted from `get-client-home-data.ts` on 2026-04-10 as part of the
 * client-portal Songs slice (slice 3 of the Songs design doc §17). Both
 * the home page and the Songs page need identical event selection so a
 * couple bookmarking `/client/songs` lands on the same event they see
 * on `/client/home` — drifting these two code paths would be a
 * confusing UX bug ("why is my songs list empty when I can see the
 * show on the home page?").
 *
 * Preference order:
 *
 *   1. Soonest upcoming event (`ends_at >= now`). Tie-breaker: earliest
 *      `starts_at`.
 *   2. Most recent past event — falls back to this so the portal stays
 *      useful after the show (the "post-event stickiness gap" Field
 *      Expert flagged in the Phase 0.5 research).
 *   3. First event in the array, if nothing has a usable `ends_at`.
 *
 * **Pure function, no DB access.** Does NOT import 'server-only' — safe
 * to call from test harnesses, client components, and server code alike.
 *
 * @module shared/lib/client-portal/pick-relevant-event
 */

/**
 * Minimal event shape the picker needs. Callers can pass any wider row
 * type — TypeScript structural typing accepts extra fields.
 */
export type PickableEvent = {
  starts_at: string | null;
  ends_at: string | null;
};

/**
 * Pick the most-relevant event from a list. Returns null for an empty
 * input (the original home-data helper returned the first element when
 * nothing had `ends_at`; that quirk is preserved for compatibility).
 *
 * Narrower callers get a narrower return type because of the generic —
 * this is important so downstream code can still read their custom
 * columns on the returned row without a widening cast.
 */
export function pickRelevantEvent<E extends PickableEvent>(
  events: readonly E[],
  now: Date = new Date(),
): E | null {
  if (events.length === 0) return null;
  const nowMs = now.getTime();

  const withEnds = events.filter((e) => e.ends_at !== null);

  const upcoming = withEnds
    .filter((e) => new Date(e.ends_at as string).getTime() >= nowMs)
    .slice()
    .sort(
      (a, b) =>
        new Date(a.starts_at ?? (a.ends_at as string)).getTime() -
        new Date(b.starts_at ?? (b.ends_at as string)).getTime(),
    );
  if (upcoming.length > 0) return upcoming[0];

  const past = withEnds
    .filter((e) => new Date(e.ends_at as string).getTime() < nowMs)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.ends_at as string).getTime() - new Date(a.ends_at as string).getTime(),
    );
  if (past.length > 0) return past[0];

  // Fallback: no ends_at on any row — pick the first.
  return events[0];
}

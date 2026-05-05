/**
 * Active events filter helper — Pass 3 Phase 4.
 *
 * `applyActiveEventsFilter(query)` adds `.is('archived_at', null)` to a
 * Supabase query builder. Returns the same query for chaining. The entire
 * point of this helper is that every surface showing "active" events uses
 * THE SAME filter pattern, so we have one place to update when the archive
 * semantics change.
 *
 * ---------------------------------------------------------------------------
 * ALLOWLIST — who should call this:
 *
 *   Active-pile consumers (must filter archived events out of their view):
 *     - src/app/(dashboard)/(features)/productions/page.tsx — CRM Stream "active"
 *       and "inquiry" tabs
 *     - src/widgets/global-pulse/lib/use-lobby-events.ts — Lobby widgets
 *     - src/widgets/dashboard/api/get-action-queue.ts — Dashboard action queue
 *     - src/widgets/dashboard/api/get-week-events.ts — Dashboard week view
 *     - src/widgets/dashboard/api/get-today-schedule.ts — Dashboard today
 *     - src/widgets/dashboard/api/get-urgency-alerts.ts — Dashboard urgency
 *     - (future) Follow-Up Engine queue readers
 *
 * DENYLIST — who must NOT call this:
 *
 *   History / finance surfaces (must see archived events):
 *     - src/features/finance/**  — open invoices on archived events are
 *       still owed money
 *     - Venue intel / VenueIntelCard — past shows at a venue are history
 *     - src/app/(portal)/pay/**  — crew pay history for archived shows
 *     - src/app/(portal)/schedule/**  — crew schedule history view
 *     - cortex.memory reads — history is the entire point
 *     - Network page past-shows list — same reason
 *     - CRM Stream "past" tab — users want to look back at last summer
 *
 * If you find yourself adding a call to this helper in any file in the
 * denylist, STOP. That is almost certainly a bug — the archive flag exists
 * to remove shows from the ACTIVE piles, not from history. Pass 3 Visionary
 * risk #3 and Signal Navigator both flagged this as the single biggest
 * failure mode for Phase 4.
 * ---------------------------------------------------------------------------
 */

/**
 * Generic query-builder shape — any object with a chainable `.is()` method.
 * Supabase query builders match this signature after select/from/eq calls.
 */
interface QueryBuilderLike<T> {
  is(column: string, value: null | boolean): T;
}

/**
 * Adds `.is('archived_at', null)` to a query. Returns the same builder for
 * chaining. Generic over the builder type so TypeScript preserves the
 * fluent-builder narrowing.
 */
export function applyActiveEventsFilter<T extends QueryBuilderLike<T>>(query: T): T {
  return query.is('archived_at', null);
}

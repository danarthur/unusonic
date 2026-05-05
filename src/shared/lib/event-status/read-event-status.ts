/**
 * `readEventStatus` — Pass 3 Phase 2 canonical read helper for event lifecycle.
 *
 * Why this exists:
 *   `ops.events` carries two parallel state columns — `status` (planned,
 *   in_progress, completed, cancelled, archived) and `lifecycle_status`
 *   (lead, tentative, confirmed, production, live, post, archived,
 *   cancelled). Phase 0's DB trigger enforces their co-validity; Phase 2's
 *   job is to give every application reader a single named phase so no
 *   consumer has to know about the pair.
 *
 * Mapping (canonical — mirrors `ops.event_status_pair_valid` at the DB level):
 *
 *   status         lifecycle_status               phase
 *   planned        null / lead / tentative /      'pre'
 *                  confirmed
 *   planned        production                     'active'
 *   in_progress    live                            'live'
 *   completed      post                            'post'
 *   cancelled      cancelled                       'cancelled'
 *   archived       archived                        'archived'
 *
 * Unknown / invalid combinations fall through to `phase: 'unknown'`. Phase 0's
 * trigger should prevent these from ever landing in the database, but tests
 * and legacy fixtures may still produce them, and the helper is defensive.
 *
 * Named exception — DO NOT route through this helper:
 *   `src/shared/lib/client-portal/event-lock.ts::computeEventLock` reads
 *   `status` directly because that column is the SQL-level contract with
 *   the `client_songs_*` RPCs. The ESLint rule allowlists event-lock.ts.
 *
 * Named exception — DO NOT swap reads in these files:
 *   - `src/app/(dashboard)/(features)/productions/actions/mark-show-state.ts`
 *   - `src/app/(dashboard)/(features)/productions/actions/delete-event.ts`
 *   These are the canonical writers and need to touch both columns in
 *   lock-step. Phase 0's trigger now makes that pair-write load-bearing
 *   rather than a band-aid — the writer stays, the comment is updated.
 */

import { eventStatusPairValid } from './pair-valid';

/**
 * Canonical show phase. Every user-facing surface should compare against
 * these values rather than reading `lifecycle_status` or `status` directly.
 *
 * - 'pre' — sales / early planning. Visible on CRM Stream inquiry/active
 *   tabs, no Plan lens surfaces yet.
 * - 'active' — post-handoff, pre-show. Plan lens is populated but the
 *   ShowControlStrip is not yet showing its Start button.
 * - 'live' — show is happening right now. ShowControlStrip is in its
 *   live state, client portal song-lock is active.
 * - 'post' — show done but not yet wrapped. Wrap report is available.
 * - 'cancelled' — cancelled event. Not shown in active CRM streams.
 * - 'archived' — wrapped and closed out (Phase 4 will wire this).
 * - 'unknown' — the status/lifecycle pair is not a recognized combination.
 *   Phase 0's DB trigger should prevent this in production; surfaces that
 *   hit 'unknown' should treat it as "no opinion" and fall back to their
 *   default rendering.
 */
export type EventPhase =
  | 'pre'
  | 'active'
  | 'live'
  | 'post'
  | 'cancelled'
  | 'archived'
  | 'unknown';

/**
 * Shape any event-like object must provide to `readEventStatus`. Accepts
 * both `status` and `lifecycle_status` as nullable so callers can pass
 * types straight from the DB without narrowing first.
 */
export type EventStatusInput = {
  status?: string | null;
  lifecycle_status?: string | null;
};

export type EventStatusResult = {
  /** The canonical named phase for this event. */
  phase: EventPhase;
  /** Pass-through of the raw DB values for display / logging. */
  raw: {
    status: string | null;
    lifecycle_status: string | null;
  };
  /**
   * True if the pair validates against `ops.event_status_pair_valid`.
   * Same contract as the DB-level invariant; use this when you need to
   * assert on data integrity (e.g., in tests or dev-mode guards).
   */
  isValid: boolean;
};

/**
 * Resolve an event's canonical phase.
 *
 * Pure function, no DB access. Idempotent. Safe to call on server or client.
 */
export function readEventStatus(event: EventStatusInput): EventStatusResult {
  const status = event.status ?? null;
  const lifecycle = event.lifecycle_status ?? null;
  const raw = { status, lifecycle_status: lifecycle };
  const isValid = eventStatusPairValid(status, lifecycle);

  if (status == null) {
    return { phase: 'unknown', raw, isValid };
  }

  switch (status) {
    case 'planned':
      // Per the Phase 0 mapping, lifecycle_status is either null or one of
      // {lead, tentative, confirmed, production}. 'production' means the
      // handoff has happened and the Plan lens is active; everything else
      // is still the sales phase.
      if (lifecycle === 'production') return { phase: 'active', raw, isValid };
      return { phase: 'pre', raw, isValid };
    case 'in_progress':
      return { phase: 'live', raw, isValid };
    case 'completed':
      return { phase: 'post', raw, isValid };
    case 'cancelled':
      return { phase: 'cancelled', raw, isValid };
    case 'archived':
      return { phase: 'archived', raw, isValid };
    default:
      return { phase: 'unknown', raw, isValid };
  }
}

/**
 * Best-effort phase resolution from ONLY the lifecycle_status column.
 *
 * Used by display surfaces that don't carry the full (status, lifecycle_status)
 * pair — most notably `CRMQueueItem` which aggregates deals and events into a
 * single shape with only `lifecycle_status` on the event side. Because Phase 0's
 * DB invariant ties the pair deterministically, reading only `lifecycle_status`
 * is lossless for the phase-level semantics this helper exposes.
 *
 *   null / lead / tentative / confirmed → 'pre'
 *   production                          → 'active'
 *   live                                → 'live'
 *   post                                → 'post'
 *   cancelled                           → 'cancelled'
 *   archived                            → 'archived'
 *   anything else                       → 'unknown'
 *
 * Prefer `readEventStatus` over this helper when you have both columns.
 */
export function readEventStatusFromLifecycle(lifecycle: string | null | undefined): EventPhase {
  if (lifecycle == null) return 'pre';
  switch (lifecycle) {
    case 'lead':
    case 'tentative':
    case 'confirmed':
      return 'pre';
    case 'production':
      return 'active';
    case 'live':
      return 'live';
    case 'post':
      return 'post';
    case 'cancelled':
      return 'cancelled';
    case 'archived':
      return 'archived';
    default:
      return 'unknown';
  }
}

/**
 * Convenience: is this event in the "post-handoff, pre-show" active state?
 * Equivalent to `readEventStatus(e).phase === 'active'`.
 */
export function isEventActive(event: EventStatusInput): boolean {
  return readEventStatus(event).phase === 'active';
}

/**
 * Convenience: is this event currently live?
 * Equivalent to `readEventStatus(e).phase === 'live'`.
 */
export function isEventLive(event: EventStatusInput): boolean {
  return readEventStatus(event).phase === 'live';
}

/**
 * Convenience: is this event in a terminal state (cancelled or archived)?
 * Useful for deciding whether to show edit affordances.
 */
export function isEventTerminal(event: EventStatusInput): boolean {
  const phase = readEventStatus(event).phase;
  return phase === 'cancelled' || phase === 'archived';
}

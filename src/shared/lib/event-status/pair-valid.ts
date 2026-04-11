/**
 * TypeScript mirror of the SQL function `ops.event_status_pair_valid(p_status, p_lifecycle)`
 * introduced in migration `event_status_lifecycle_invariant` (Pass 3 Phase 0).
 *
 * The SQL function is the canonical authority — the trigger
 * `ops.events_status_pair_check` on `ops.events` uses it to reject any
 * status/lifecycle_status combination that would put the row into a
 * drifted state. This module exists so application code and tests can
 * run the same validation without a database round-trip, and so Phase 2's
 * `readEventStatus` helper can rely on the same mapping.
 *
 * If the SQL function changes, this file MUST be updated in lock-step.
 * The eventStatusPairValid.test.ts test file covers the intended mapping
 * table so a drift between SQL and TS surfaces as a test failure.
 */

/**
 * Canonical `ops.events.status` values, per the Pass 3 Phase 0 mapping.
 * The DB column itself is `text`, not an enum — these values are policy-level.
 */
export type EventStatusValue =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'archived';

/**
 * Canonical `ops.events.lifecycle_status` values, per the Pass 3 Phase 0 mapping.
 * NULL is also allowed when status === 'planned' (legacy inquiry rows).
 */
export type EventLifecycleValue =
  | 'lead'
  | 'tentative'
  | 'confirmed'
  | 'production'
  | 'live'
  | 'post'
  | 'archived'
  | 'cancelled';

/**
 * Returns true if the (status, lifecycle_status) pair is a valid combination.
 * Mirrors `ops.event_status_pair_valid` exactly.
 *
 * Mapping:
 *   status='planned'      -> lifecycle_status IN (NULL, lead, tentative, confirmed, production)
 *   status='in_progress'  -> lifecycle_status = 'live'
 *   status='completed'    -> lifecycle_status = 'post'
 *   status='cancelled'    -> lifecycle_status = 'cancelled'
 *   status='archived'     -> lifecycle_status = 'archived'
 *   anything else         -> invalid
 */
export function eventStatusPairValid(
  status: string | null | undefined,
  lifecycle: string | null | undefined,
): boolean {
  if (status == null) return false;
  switch (status) {
    case 'planned':
      return (
        lifecycle == null ||
        lifecycle === 'lead' ||
        lifecycle === 'tentative' ||
        lifecycle === 'confirmed' ||
        lifecycle === 'production'
      );
    case 'in_progress':
      return lifecycle === 'live';
    case 'completed':
      return lifecycle === 'post';
    case 'cancelled':
      return lifecycle === 'cancelled';
    case 'archived':
      return lifecycle === 'archived';
    default:
      return false;
  }
}

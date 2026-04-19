/**
 * Enumeration-guard timing helpers for `resolveContinueAction`.
 *
 * The bare-email surface at `/login` must not leak whether an account
 * exists, whether a ghost entity matches, or whether the email is
 * completely unknown. The three internal branches MUST produce
 * indistinguishable responses — identical return shape, identical
 * latency distribution, identical logging surface.
 *
 * This module owns the timing-normalization pieces so the dispatcher
 * reads as a flat decision tree without inline timing tricks:
 *
 *   1. `runDummyCompare` — fixed-cost hash loop that runs unconditionally
 *      on every Continue press. Without it, the miss path ("email has no
 *      account") is measurably faster than the hit path, and an attacker
 *      can distinguish the branches by wall time.
 *   2. `delayToFloor` — ensures every non-passkey response observes a
 *      ≥ 400ms floor plus 0-50ms jitter. Matches the spec's §3.1 jitter
 *      floor exactly.
 *
 * We don't ship bcrypt (not in `package.json`), so the dummy compare is
 * a SHA-256 digest loop sized to match the wall-clock cost of a real
 * Supabase lookup round-trip. See {@link DUMMY_COMPARE_ITERATIONS}.
 *
 * @module features/auth/smart-login/lib/enumeration-guard
 */

import 'server-only';
import { createHash, randomInt } from 'node:crypto';

/**
 * Cost factor for the dummy compare. Picked so the operation takes on
 * the order of ~5-10ms on a typical serverless worker — enough to
 * normalize the sub-millisecond delta between "entity row exists" and
 * "no such row" without blowing the 400ms jitter floor. Exposed for
 * tests that want to pin the work without timing drift.
 */
export const DUMMY_COMPARE_ITERATIONS = 600;

/**
 * Fixed, non-secret, baked-in string used as input to the dummy compare
 * loop. The value is arbitrary — what matters is that the loop runs in
 * constant time on every Continue press regardless of the branch the
 * dispatcher took. NEVER use this as a secret; it's hardcoded for
 * predictability.
 */
const DUMMY_INPUT =
  'unusonic-enumeration-guard-dummy-v1-ef7a4bcdebdf45a08e1a2f54d6c3e7b9';

/**
 * Run a constant-cost hash loop that always executes, regardless of
 * which internal branch the dispatcher selected. The `marker` parameter
 * is mixed into the first iteration so the V8 JIT can't fold the loop
 * at a lower level — a different email should produce a different
 * hash, even though the wall-clock cost is identical.
 *
 * Returns the final hex digest so the caller can (optionally) assign
 * the value to a variable and prevent the JIT from eliminating the
 * loop as dead code. Callers routinely discard it.
 *
 * @param marker Per-call value (e.g. the normalized email) mixed into
 *   the first hash. Prevents dead-code elimination and forces different
 *   inputs through different memory.
 */
export function runDummyCompare(marker: string): string {
  let acc = `${DUMMY_INPUT}:${marker}`;
  for (let i = 0; i < DUMMY_COMPARE_ITERATIONS; i++) {
    acc = createHash('sha256').update(acc).digest('hex');
  }
  return acc;
}

/**
 * Spec's jitter floor: `max(elapsedMs, 400) + randomInt(0, 50)`.
 *
 * Pulled out so the dispatcher stays flat and so tests can swap the
 * delay source without a global timer clock.
 *
 * @param elapsedMs Milliseconds since the Continue press was received.
 *   Typically `Date.now() - started` from the top of the action.
 * @param delay Override the timer function (defaults to setTimeout via
 *   a Promise). Tests pass a synthetic delay to assert the floor-shape
 *   without running the clock.
 */
export async function delayToFloor(
  elapsedMs: number,
  delay: (ms: number) => Promise<void> = defaultDelay,
): Promise<void> {
  const floor = 400;
  const baseRemainder = Math.max(floor - elapsedMs, 0);
  const jitter = randomInt(0, 50); // inclusive 0, exclusive 50 — matches spec
  const total = baseRemainder + jitter;
  if (total <= 0) return;
  await delay(total);
}

function defaultDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Minimum wall time a non-passkey Continue response is allowed to
 * take, per §3.1 of the login-redesign design. Exposed for tests that
 * assert the floor without timing against `Date.now()`.
 */
export const JITTER_FLOOR_MS = 400;
/** Upper bound of the random jitter added on top of the floor. */
export const JITTER_RANGE_MS = 50;

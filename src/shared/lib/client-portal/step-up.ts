/**
 * Step-up gate — enforces invariant §14.6(1): magic-link access is read-only.
 *
 * Every mutation endpoint in the client portal must wrap its handler in
 * `requireStepUp()`. If the current request has no valid step-up JWT claim
 * (or the claim is expired, or the method doesn't match a per-action
 * requirement), the handler returns 401 with a structured payload that the
 * client SDK uses to launch the OTP/passkey flow.
 *
 * ## Sliding 30-minute window (§0 A6, added 2026-04-10)
 *
 * Every successful `requireStepUp()` call **refreshes** the step-up cookie
 * by another full 30-minute window. This is what keeps a couple building
 * a 20-song playlist in one sitting from seeing 20 OTP prompts — as long
 * as any two successful mutations are less than 30 minutes apart, the
 * session stays stepped-up indefinitely (up to the session token's own
 * event-lifetime ceiling).
 *
 * **Design consequence:** `requireStepUp()` has side effects — it writes a
 * cookie on success. That's why the cookie jar access is wrapped in a
 * try/catch — if the caller is in a context where cookie writes aren't
 * legal (e.g. a server component outside a route handler), the refresh
 * silently no-ops and the original expiry stands. In practice, the only
 * callers that need the slide are mutation endpoints (route handlers and
 * server actions), which are always cookie-write-legal.
 *
 * **Why not a pure check + explicit refresh helper?** Because the
 * "forgot to call touchStepUpCookie() after the RPC" failure mode is
 * silently UX-fatal (Maya sees 20 OTP prompts, quits). Baking the slide
 * into `requireStepUp()` makes the correct behavior the default.
 *
 * ## When the slide explicitly does NOT apply
 *
 * - Denial paths (`ok: false`) never write the cookie. An expired or
 *   missing claim stays expired.
 * - Caller contexts where `cookies().set()` throws silently drop the
 *   refresh — the original claim remains valid until its stored expiry.
 *   Server components that care about freshness should call a route
 *   handler, not rely on a side-effecting check.
 *
 * ## Integration test contract
 *
 * The "10 adds → 1 prompt" invariant is pinned by
 * `src/shared/lib/client-portal/__tests__/step-up.test.ts`. If any future
 * refactor breaks the slide, that test fails and this comment block is
 * the rationale for not "fixing" it by dropping the side effect.
 *
 * See client-portal-design.md §14.6(1), §15.4, §17.12.5, and the Songs
 * design doc §0 A6.
 *
 * @module shared/lib/client-portal/step-up
 */
import 'server-only';

import { readStepUpCookie, setStepUpCookie } from './cookies';

export type StepUpMethod = 'otp' | 'passkey';

export type StepUpRequirement = {
  /** If set, only sessions step-up'd via this exact method pass. */
  requireMethod?: StepUpMethod;
  /**
   * If `false`, skip the sliding-window refresh on success. Defaults to
   * `true`. Pass `false` only for read-path checks that sample the
   * current step-up state without consuming it (e.g. a layout hint
   * rendering "you're stepped up for 12 more minutes").
   *
   * Mutation endpoints MUST leave this at the default.
   */
  slide?: boolean;
};

export type StepUpDenial = {
  ok: false;
  reason: 'missing' | 'expired' | 'wrong_method';
  required: StepUpMethod | 'any';
};

export type StepUpApproval = {
  ok: true;
  method: StepUpMethod;
  /**
   * The expiry AFTER the sliding refresh (if `slide` is true, which is
   * the default). Callers that need the pre-slide expiry — rare — should
   * pass `slide: false`.
   */
  expiresAt: Date;
};

/**
 * Check whether the current request has a valid step-up claim.
 *
 * On success: returns `{ ok: true, method, expiresAt }` AND refreshes
 * the step-up cookie by another full TTL window (sliding behavior).
 *
 * On failure: returns `{ ok: false, reason, required }` with no cookie
 * side effect. Callers should wrap this in `stepUpRequiredResponse()`
 * and return a 401 — the client SDK recognizes the shape and launches
 * the OTP/passkey flow.
 *
 * @see module JSDoc above for the sliding-window rationale.
 */
export async function requireStepUp(
  requirement: StepUpRequirement = {},
): Promise<StepUpApproval | StepUpDenial> {
  const claim = await readStepUpCookie();

  if (!claim) {
    return { ok: false, reason: 'missing', required: requirement.requireMethod ?? 'any' };
  }

  if (claim.stepUpUntil.getTime() < Date.now()) {
    return { ok: false, reason: 'expired', required: requirement.requireMethod ?? 'any' };
  }

  if (requirement.requireMethod && claim.stepUpMethod !== requirement.requireMethod) {
    return { ok: false, reason: 'wrong_method', required: requirement.requireMethod };
  }

  // Sliding refresh — see module JSDoc §"Sliding 30-minute window".
  //
  // Wrapped in try/catch because some callers (server components without a
  // route-handler context) can't write cookies. In those contexts the refresh
  // silently no-ops; the claim's stored expiry remains authoritative.
  const shouldSlide = requirement.slide !== false;
  let effectiveExpiresAt = claim.stepUpUntil;
  if (shouldSlide) {
    try {
      await setStepUpCookie(claim.stepUpMethod);
      // The refresh wrote a cookie with expiry = now + TTL. Reflect that in
      // the returned approval so callers don't have to re-read.
      effectiveExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    } catch {
      // Cookie write not allowed in this context (e.g. server component).
      // Fall through — the original claim is still valid for this request.
    }
  }

  return { ok: true, method: claim.stepUpMethod, expiresAt: effectiveExpiresAt };
}

/**
 * Structured 401 body for the client SDK to recognize and handle.
 */
export function stepUpRequiredResponse(denial: StepUpDenial): {
  status: 401;
  body: {
    step_up_required: true;
    reason: StepUpDenial['reason'];
    required: StepUpDenial['required'];
  };
} {
  return {
    status: 401,
    body: {
      step_up_required: true,
      reason: denial.reason,
      required: denial.required,
    },
  };
}

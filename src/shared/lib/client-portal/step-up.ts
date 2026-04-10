/**
 * Step-up gate — enforces invariant §14.6(1): magic-link access is read-only.
 *
 * Every mutation endpoint in the client portal must wrap its handler in
 * requireStepUp(). If the current request has no valid step-up JWT claim
 * (or the claim is expired, or the method doesn't match a per-action
 * requirement), the handler returns 401 with a structured payload that the
 * client SDK uses to launch the OTP/passkey flow.
 *
 * See client-portal-design.md §14.6(1), §15.4, §17.12.5.
 *
 * @module shared/lib/client-portal/step-up
 */
import 'server-only';

import { readStepUpCookie } from './cookies';

export type StepUpMethod = 'otp' | 'passkey';

export type StepUpRequirement = {
  /** If set, only sessions step-up'd via this exact method pass. */
  requireMethod?: StepUpMethod;
};

export type StepUpDenial = {
  ok: false;
  reason: 'missing' | 'expired' | 'wrong_method';
  required: StepUpMethod | 'any';
};

export type StepUpApproval = {
  ok: true;
  method: StepUpMethod;
  expiresAt: Date;
};

/**
 * Check whether the current request has a valid step-up claim.
 *
 * Callers should return a 401 with the denial payload on failure —
 * the client SDK recognizes { step_up_required: true } and launches
 * the OTP/passkey flow.
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

  return { ok: true, method: claim.stepUpMethod, expiresAt: claim.stepUpUntil };
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

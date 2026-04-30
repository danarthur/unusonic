/**
 * Smart Login — magic-link sign-in server action (Phase 2 entry point).
 *
 * Owns: `sendMagicLinkAction` — the "account exists" branch only.
 * The full three-way dispatcher (account-exists / ghost-match / unknown)
 * lives in `./resolve-continue.ts`. Until Phase 4 flips
 * `AUTH_V2_MAGIC_LINK_REPLACES_OTP`, this action is called only from
 * tests or the flag-gated session-expired overlay.
 *
 * @module features/auth/smart-login/api/actions/magic-link
 */
'use server';

import * as Sentry from '@sentry/nextjs';
import { getSystemClient } from '@/shared/api/supabase/system';
import { sendMagicLinkSignIn } from '@/shared/api/email/send';
import { classifyUserAgent } from '@/shared/lib/auth/classify-user-agent';
import { hashEmailForTelemetry } from '@/shared/lib/auth/hash-email-for-telemetry';
import { otpEmailSchema } from '../../model/schema';
import {
  emitContinueResolved,
  type AuthResolution,
} from '../../lib/auth-telemetry';
import { checkMagicLinkRateLimit } from '../../lib/magic-link-rate-limit';
import { readUserAgent, readRequestIp } from './_helpers';

/**
 * Phase 2 — send a Supabase-generated magic sign-in link to an email with
 * an existing `auth.users` account.
 *
 * ## Enumeration-guard boundary
 *
 * This action is the **"account exists"** branch only. The full three-way
 * dispatcher (account-exists → `sendMagicLinkAction`, ghost-match →
 * `GhostClaimEmail`, unknown → `UnknownEmailSignupEmail`) lands in Phase 4,
 * along with the `resolveContinueAction` dispatcher in
 * `docs/reference/login-redesign-design.md` §3.1. Until then, do NOT call
 * this action directly from the UI; it is called only from tests or a
 * flag-gated code path under `AUTH_V2_MAGIC_LINK_REPLACES_OTP`.
 *
 * ## Flow
 *
 * 1. Validate input via the existing email schema (`otpEmailSchema`).
 * 2. Rate-limit per IP (10/min) + per email-hash (5/min). Both are
 *    mapped to the same enumeration-safe rejection.
 * 3. Ask the service-role client for a magic-link action URL via
 *    `auth.admin.generateLink({ type:'magiclink' })`. Service role is the
 *    only surface that can generate for an arbitrary email without a
 *    current session.
 * 4. Send the email via `sendMagicLinkSignIn`.
 * 5. Emit the same Phase-0 `continue_resolved` telemetry that
 *    `sendOtpAction` uses so the rollout dashboard is comparable across
 *    the OTP↔magic-link cutover.
 *
 * Returns the window expiry so the UI can render the exact-minutes copy
 * ("Check your email. Link expires in 60 minutes.") without having to
 * know the Supabase default.
 *
 * **Never removed `sendOtpAction`** — both paths stay live until Phase 4
 * flips the state-machine to this action behind the flag.
 */
export async function sendMagicLinkAction(
  email: string,
): Promise<{ ok: true; expiresAt: string } | { ok: false; error: string }> {
  const started = Date.now();
  const userAgent = await readUserAgent();
  const requestIp = await readRequestIp();

  // 1. Validate. Same schema as OTP; trimmed + lowercased + email regex.
  const parsed = otpEmailSchema.safeParse({ email });
  if (!parsed.success) {
    // Malformed input: not a resolvable Continue press. Skip telemetry.
    return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid email' };
  }
  const normalizedEmail = parsed.data.email;

  // 2. Rate-limit. The two throttles map to the same telemetry bucket;
  //    the caller cannot distinguish which fired (enumeration-safe).
  const emailHash = hashEmailForTelemetry(normalizedEmail);
  const rate = checkMagicLinkRateLimit({ ip: requestIp, emailHash });
  if (!rate.allowed) {
    Sentry.logger.info('auth.sendMagicLink.rateLimited', {
      scope: rate.scope,
      retryAfterSeconds: rate.retryAfterSeconds,
    });
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'rate_limited' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return {
      ok: false,
      error: 'Too many sign-in attempts. Wait a minute and try again.',
    };
  }

  // 3. Generate the link. Service role — admin operation on an arbitrary
  //    email without a current session (mirrors the pattern used by
  //    `adminResetMemberPasskey` and the client-portal magic-link route).
  const system = getSystemClient();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const { data: linkData, error: linkError } = await system.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizedEmail,
    options: {
      // `/login` mounts the `(auth)` layout's `AuthHashHandler`, which
      // reads the implicit-flow hash (`#access_token=...`) and calls
      // `setSession` client-side — no new route handler needed.
      redirectTo: `${baseUrl.replace(/\/$/, '')}/login`,
    },
  });

  if (linkError || !linkData?.properties?.action_link) {
    Sentry.logger.warn('auth.sendMagicLink.generateLinkFailed', {
      code: linkError?.message,
    });
    emitContinueResolved({
      email: normalizedEmail,
      // generic failure bucket — `unknown` mirrors `sendOtpAction`'s
      // classification of delivery failures.
      resolution: 'unknown' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return { ok: false, error: 'Could not send sign-in link. Try again.' };
  }

  // 4. Deliver the email.
  const emailResult = await sendMagicLinkSignIn({
    targetEmail: normalizedEmail,
    magicLinkUrl: linkData.properties.action_link,
    expiresMinutes: 60,
    userAgentClass: classifyUserAgent(userAgent),
  });

  if (!emailResult.ok) {
    Sentry.logger.warn('auth.sendMagicLink.emailFailed', {
      error: emailResult.error,
    });
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'unknown' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return { ok: false, error: 'Could not send sign-in link. Try again.' };
  }

  // 5. Telemetry. Success maps to `magic_link` so the Phase-0 dashboard
  //    can compare OTP→magic-link shadow rates across the cutover.
  emitContinueResolved({
    email: normalizedEmail,
    resolution: 'magic_link' satisfies AuthResolution,
    latencyMs: Date.now() - started,
    userAgent,
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  return { ok: true, expiresAt };
}

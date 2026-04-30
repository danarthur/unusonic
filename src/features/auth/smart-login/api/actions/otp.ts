/**
 * Smart Login — OTP code flow server actions.
 *
 * Owns: legacy 6-digit email-OTP fallback path used when passkey is
 * unavailable AND the magic-link Phase 4 flag is OFF.
 *   - sendOtpAction   — request a code, enumeration-safe silent success
 *   - verifyOtpAction — verify the code and redirect to /lobby (or `next`)
 *
 * Both paths emit Phase-0 `continue_resolved` shadow telemetry.
 *
 * @module features/auth/smart-login/api/actions/otp
 */
'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { otpEmailSchema, otpVerifySchema } from '../../model/schema';
import {
  emitContinueResolved,
  type AuthResolution,
} from '../../lib/auth-telemetry';
import { readUserAgent, sanitizeRedirectPath } from './_helpers';

/**
 * Send a one-time sign-in code to the user's email.
 * Supabase sends a 6-digit OTP code. Fallback for devices without passkey support.
 *
 * Emits a Phase 0 shadow-telemetry event (`continue_resolved`) after
 * the decision is made. Telemetry never alters user-visible behavior.
 */
export async function sendOtpAction(
  email: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const started = Date.now();
  const userAgent = await readUserAgent();

  const parsed = otpEmailSchema.safeParse({ email });
  if (!parsed.success) {
    // Malformed input: not a resolvable Continue press. Skip telemetry.
    return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid email' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: false },
  });

  let resolution: AuthResolution = 'magic_link';

  if (error) {
    // Don't reveal whether the email exists
    if (error.message.includes('not found') || error.message.includes('not registered')) {
      // Silent success to prevent email enumeration — but log so we can tell
      // "no account" from a genuine delivery failure that happens to stringify
      // the same way.
      Sentry.captureMessage('sendOtpAction: silent success path', {
        level: 'info',
        tags: { area: 'auth.otp', reason: 'enumeration-guard' },
        extra: { code: error.code, message: error.message },
      });
      resolution = 'unknown';
      emitContinueResolved({
        email: parsed.data.email,
        resolution,
        latencyMs: Date.now() - started,
        userAgent,
      });
      return { ok: true };
    }
    Sentry.captureMessage('sendOtpAction: delivery failed', {
      level: 'warning',
      tags: { area: 'auth.otp' },
      extra: { code: error.code, message: error.message },
    });
    // Heuristic: Supabase surfaces "rate limit" text on its throttled
    // responses. Anything else we classify as magic_link (the intended
    // path that failed) so the resolution bucket remains interpretable.
    if (/rate limit/i.test(error.message)) {
      resolution = 'rate_limited';
    }
    emitContinueResolved({
      email: parsed.data.email,
      resolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return { ok: false, error: 'Failed to send code. Try again.' };
  }

  emitContinueResolved({
    email: parsed.data.email,
    resolution,
    latencyMs: Date.now() - started,
    userAgent,
  });
  return { ok: true };
}

/**
 * Verify a 6-digit OTP code sent to the user's email.
 * On success, establishes a session and redirects to home.
 */
export async function verifyOtpAction(
  email: string,
  token: string,
  redirectTo?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = otpVerifySchema.safeParse({ email, token });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'Invalid code' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: 'email',
  });

  if (error) {
    return { ok: false, error: 'Invalid or expired code. Try again.' };
  }

  const sanitized = sanitizeRedirectPath(redirectTo);
  redirect(sanitized ?? '/lobby');
}

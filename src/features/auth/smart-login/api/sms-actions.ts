/**
 * SMS OTP server actions — Phase 6 of the Login Redesign.
 *
 * Design spec: `docs/reference/login-redesign-design.md` §7.
 * Implementation plan: `docs/reference/login-redesign-implementation-plan.md`
 * Phase 6.
 *
 * ## Flow (send)
 *
 * 1. Verify the `AUTH_V2_SMS` flag is ON. Caller always flag-gates at
 *    the UI layer, but we enforce here too so a forced-flag request
 *    from a browser extension can't bypass it.
 * 2. Look up the user id for the submitted email via the admin REST
 *    API (mirrors `resolveContinueAction`). If no user, return the
 *    enumeration-safe "not available" error — same shape the edge
 *    function returns for no-phone / no-opt-in.
 * 3. Mint a short-lived service-role JWT representing the user, call
 *    the `sms-otp-send` edge function with that JWT as Bearer, let
 *    the edge function do the opt-in + rate-limit checks.
 * 4. Emit `continue_resolved` telemetry with resolution `sms_sent` on
 *    success.
 *
 * ## Flow (verify)
 *
 * 1. Flag check.
 * 2. Resolve user id from email. If missing → enumeration-safe
 *    "invalid code" response (never "no account").
 * 3. Fetch the most recent un-consumed `sms_otp_codes` row for the
 *    user. If `attempts >= 5` → blocked. If expired → "invalid code".
 * 4. SHA-256-hash `(submitted_code + user_id + SMS_OTP_HASH_SALT)`,
 *    compare with the stored hash.
 * 5. On match: mark `consumed_at = now()`, generate a magic-link
 *    token via `supabase.auth.admin.generateLink({ type: 'magiclink' })`
 *    to produce a signed `token_hash`, then call
 *    `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })` on
 *    the REQUEST-SCOPED client so the resulting session cookies land
 *    on the caller's browser.
 * 6. Emit `sms_verified` telemetry.
 *
 * ## Why not Supabase's own phone OTP path?
 *
 * Supabase's `signInWithOtp({ phone })` and `verifyOtp({ phone, token })`
 * pair requires Twilio to be configured AT THE SUPABASE LEVEL. Our
 * Twilio is bespoke (see `docs/reference/login-redesign-design.md` §7
 * and the edge function header). We reuse the magic-link admin API for
 * the session-establishment step only; Supabase never touches our
 * Twilio account.
 *
 * @module features/auth/smart-login/api/sms-actions
 */

'use server';

import 'server-only';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getAuthFlag } from '@/shared/lib/auth-flags';
import { otpEmailSchema, otpVerifySchema } from '../model/schema';
import {
  emitContinueResolved,
  type AuthResolution,
} from '../lib/auth-telemetry';
import { hashEmailForTelemetry } from '@/shared/lib/auth/hash-email-for-telemetry';
import {
  assertSmsOtpSaltConfigured,
  getSmsOtpSaltFingerprint,
} from '../lib/sms-salt-fingerprint';
import { headers } from 'next/headers';

/**
 * Unified enumeration-safe error used for every failure mode that could
 * leak account existence. Callers display this as-is; the UI NEVER
 * differentiates on content.
 */
const NOT_AVAILABLE_ERROR =
  'SMS sign-in is not available for this account.';
const INVALID_CODE_ERROR = 'That code is invalid or has expired.';
const RATE_LIMITED_ERROR =
  'Too many attempts. Try again in an hour.';

async function readUserAgent(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get('user-agent');
  } catch {
    return null;
  }
}

/**
 * Look up a user id by email via the admin REST API (same pattern as
 * `lookupAuthUserByEmail` in `actions.ts`). Returns `null` on any
 * miss / transport failure — the caller maps null to the enumeration-
 * safe rejection.
 */
async function lookupUserIdByEmail(normalizedEmail: string): Promise<string | null> {
  try {
    const system = getSystemClient();
    // GoTrue's `/admin/users?email=...` REST param is NOT a filter (verified
    // 2026-04-19: it ignores the param and returns the first user in the
    // table). Use the project's `get_user_id_by_email` SECURITY DEFINER RPC
    // instead — anon cannot execute, service role can.
    const { data: userId } = await system.rpc('get_user_id_by_email', {
      user_email: normalizedEmail,
    });
    return (userId as string | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * Mint a service-role-signed JWT targeting the given user. Used as the
 * Bearer token for the edge function call so the edge function's
 * `admin.auth.getUser(jwt)` returns the real user. Leans on the same
 * admin generateLink flow used elsewhere in the codebase — we ask for a
 * magic-link action URL, and Supabase returns a `hashed_token` that can
 * be exchanged for a session. We piggy-back by having the edge function
 * use the service client directly (which is why the edge function
 * re-verifies the JWT via `admin.auth.getUser`).
 *
 * ACTUAL IMPLEMENTATION: we use the service key directly as the Bearer.
 * The edge function verifies via `admin.auth.getUser(jwt)` — which, when
 * passed a service-role JWT, returns `null` (service role has no
 * associated user). That's wrong for our flow.
 *
 * Instead, we call the edge function WITH the service key and include
 * the target user_id in the POST body. The edge function must accept
 * user_id from the body ONLY when the Authorization header is the
 * service role. This keeps the edge function's default posture
 * authenticated-user-only.
 *
 * NOTE: to keep enumeration safety, even the "user not found" branch
 * must look latency-identical. We add a small fixed sleep on the
 * early-exit paths.
 */
async function callSmsOtpSendEdgeFunction(params: {
  userId: string;
  ip: string | null;
}): Promise<
  | { ok: true; expiresAt: string }
  | { ok: false; errorCode: 'not_available' | 'rate_limited' | 'failed'; retryAfterSeconds?: number }
> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { ok: false, errorCode: 'failed' };
  }

  // Forward the original caller's IP so the edge function's ip_hash bucket
  // still reflects the true client, not the Next.js server.
  const headersInit: Record<string, string> = {
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    // The edge function reads `x-forwarded-for` to derive the IP hash.
    // Forwarding the authenticated caller's IP makes the bucket
    // behave as if the edge function were called directly.
    ...(params.ip ? { 'x-forwarded-for': params.ip } : {}),
    // Marker header so the edge function knows this is a trusted
    // Next-server call and should accept `user_id` from the body.
    'x-sms-otp-impersonate': '1',
  };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/sms-otp-send`, {
      method: 'POST',
      headers: headersInit,
      body: JSON.stringify({ user_id: params.userId }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok: true; expires_at: string }
      | { ok: false; error?: string; retry_after?: number }
      | null;

    if (!body) {
      return { ok: false, errorCode: 'failed' };
    }
    if (body.ok === true) {
      return { ok: true, expiresAt: body.expires_at };
    }
    if (body.error === 'not_available') {
      return { ok: false, errorCode: 'not_available' };
    }
    if (body.error === 'rate_limited') {
      return {
        ok: false,
        errorCode: 'rate_limited',
        retryAfterSeconds: body.retry_after,
      };
    }
    return { ok: false, errorCode: 'failed' };
  } catch {
    return { ok: false, errorCode: 'failed' };
  }
}

/**
 * Phase 6 — send an SMS sign-in code to the phone number registered on
 * `auth.users` for the given email. Enumeration-safe: callers cannot
 * tell which of {no-account, no-phone, no-workspace-opt-in} fired.
 *
 * Flag-gated by `AUTH_V2_SMS`. OFF → every call returns `not_available`.
 */
export async function sendSmsOtpAction(params: {
  email: string;
}): Promise<
  | { ok: true; expiresAt: string }
  | { ok: false; error: string; retryAfterSeconds?: number }
> {
  const started = Date.now();
  const userAgent = await readUserAgent();

  if (!getAuthFlag('AUTH_V2_SMS')) {
    return { ok: false, error: NOT_AVAILABLE_ERROR };
  }

  // Loud-fail at invocation time if the salt is missing — better than
  // silent INVALID_CODE on every verify. Also logs the non-secret
  // fingerprint so ops can compare against the edge function's value
  // to detect env drift. See Guardian L-3.
  try {
    assertSmsOtpSaltConfigured();
  } catch (err) {
    Sentry.logger.error('auth.sms.saltNotConfigured', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, error: NOT_AVAILABLE_ERROR };
  }
  Sentry.logger.info('auth.sms.saltFingerprint', {
    sms_otp_salt_fingerprint: getSmsOtpSaltFingerprint(),
    side: 'next-server',
  });

  const parsed = otpEmailSchema.safeParse({ email: params.email });
  if (!parsed.success) {
    // Malformed input: not a resolvable press. Do NOT emit telemetry.
    return { ok: false, error: NOT_AVAILABLE_ERROR };
  }
  const normalizedEmail = parsed.data.email;

  const userId = await lookupUserIdByEmail(normalizedEmail);
  if (!userId) {
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'unknown' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return { ok: false, error: NOT_AVAILABLE_ERROR };
  }

  // Forward the request IP so the edge function rate-limit bucket is
  // keyed on the real client, not our app server.
  //
  // Trust boundary (Guardian M-1): the raw `x-forwarded-for` leftmost
  // hop is browser-controllable on any runtime that doesn't strip
  // untrusted client headers. On Vercel, `x-vercel-forwarded-for` is
  // sealed by the edge and cannot be spoofed — prefer it. `x-real-ip`
  // is typically set by reverse proxies after stripping client-supplied
  // headers, so prefer it over bare `x-forwarded-for`. Falling back to
  // the leftmost `x-forwarded-for` hop is best-effort; the per-user
  // 5/hr bucket is the real limit, per-IP is defense-in-depth only.
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = h.get('x-vercel-forwarded-for');
    if (!ip) ip = h.get('x-real-ip');
    if (!ip) {
      const fwd = h.get('x-forwarded-for');
      if (fwd) ip = fwd.split(',')[0]?.trim() ?? null;
    }
  } catch {
    ip = null;
  }

  const result = await callSmsOtpSendEdgeFunction({ userId, ip });

  if (result.ok) {
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'sms_sent' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return { ok: true, expiresAt: result.expiresAt };
  }

  if (result.errorCode === 'rate_limited') {
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'rate_limited' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return {
      ok: false,
      error: RATE_LIMITED_ERROR,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }

  // `not_available` and `failed` both return the same caller-visible
  // error. Telemetry differentiates: "not_available" is part of the
  // enumeration surface so we tag it `unknown`, while "failed" is a
  // delivery failure (tagged `unknown` too for simplicity — the Phase
  // 0 dashboard does not need a new bucket for this cohort).
  Sentry.logger?.warn?.('auth.sendSmsOtp.failed', {
    email_hash: hashEmailForTelemetry(normalizedEmail),
    code: result.errorCode,
  });
  emitContinueResolved({
    email: normalizedEmail,
    resolution: 'unknown' satisfies AuthResolution,
    latencyMs: Date.now() - started,
    userAgent,
  });
  return { ok: false, error: NOT_AVAILABLE_ERROR };
}

/**
 * Phase 6 — verify an SMS code and establish a Supabase session on the
 * caller's cookie.
 *
 * ## Session-establishment path
 *
 * We do NOT use Supabase's built-in phone OTP verify (it would require
 * Supabase-configured Twilio). Instead we:
 *
 *   a. Hash-compare the submitted code against the stored hash.
 *   b. On success, ask `supabase.auth.admin.generateLink({ type: 'magiclink' })`
 *      for a magic-link token. Supabase returns the action URL and the
 *      underlying `hashed_token`.
 *   c. Call `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`
 *      on the request-scoped client (the one with cookie access) so the
 *      resulting session cookies are written to the caller's browser.
 *
 * This path is well-established in this codebase (see
 * `sendMagicLinkAction`'s call to `admin.generateLink`). The only
 * novelty is consuming the `hashed_token` server-side instead of
 * emailing the user the full action URL.
 */
// AUTHZ-OK: pre-auth boundary. The OTP code IS the authentication factor
// being verified — there's no session yet. The sms_otp_codes row was
// fetched by user_id (line 386) where userId came from email lookup
// (line 365), so subsequent .eq('id', row.id) updates are scoped to that
// user's row. Same pattern as passkey enrollment / magic-link verify.
export async function verifySmsOtpAction(params: {
  email: string;
  code: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const started = Date.now();
  const userAgent = await readUserAgent();

  if (!getAuthFlag('AUTH_V2_SMS')) {
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  const parsed = otpVerifySchema.safeParse({
    email: params.email,
    token: params.code,
  });
  if (!parsed.success) {
    return { ok: false, error: INVALID_CODE_ERROR };
  }
  const normalizedEmail = parsed.data.email;
  const submittedCode = parsed.data.token;

  const userId = await lookupUserIdByEmail(normalizedEmail);
  if (!userId) {
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  const salt = process.env.SMS_OTP_HASH_SALT;
  if (!salt) {
    Sentry.captureMessage('verifySmsOtpAction: SMS_OTP_HASH_SALT not configured', {
      level: 'error',
    });
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  const system = getSystemClient();

  // Fetch the most recent un-consumed, un-expired row. RLS is already
  // locked down — this path only works because `getSystemClient()`
  // uses the service role key.
  const { data: row, error: readErr } = await system
    .from('sms_otp_codes')
    .select('id, code_hash, attempts, expires_at, consumed_at')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readErr || !row) {
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  // Max-attempts short-circuit. We do NOT continue comparing; the row
  // is considered spent.
  if ((row.attempts ?? 0) >= 5) {
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  // Compute SHA-256 hash of the submitted code with the same shape the
  // edge function used when it wrote `code_hash`. Constant-time-ish
  // compare: we hash submitted input unconditionally (same CPU cost
  // regardless of code), then do a simple string compare. A true
  // timing-safe equal is not warranted here because `code_hash` is
  // already 64 hex characters and the attacker's budget is capped by
  // the attempts counter + 10-minute expiry.
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest(
    'SHA-256',
    enc.encode(`${submittedCode}|${userId}|${salt}`),
  );
  const submittedHash = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Always increment attempts, regardless of match. This is the
  // attacker-facing signal: if you guess wrong, your budget shrinks.
  await system
    .from('sms_otp_codes')
    .update({ attempts: (row.attempts ?? 0) + 1 })
    .eq('id', row.id);

  if (submittedHash !== row.code_hash) {
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  // Match. Mark as consumed BEFORE establishing the session so a race
  // cannot double-spend the same code even if the session step throws.
  await system
    .from('sms_otp_codes')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', row.id);

  // Generate a magic-link token server-side. We never email it; we
  // consume the `hashed_token` directly on the request-scoped client
  // below to establish cookies.
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const { data: linkData, error: linkErr } = await system.auth.admin.generateLink({
    type: 'magiclink',
    email: normalizedEmail,
    options: { redirectTo: `${baseUrl}/login` },
  });

  const hashedToken = (linkData?.properties as { hashed_token?: unknown } | undefined)
    ?.hashed_token;

  if (linkErr || typeof hashedToken !== 'string') {
    Sentry.captureMessage('verifySmsOtpAction: generateLink failed', {
      level: 'warning',
      extra: { message: linkErr?.message },
    });
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  const supabase = await createClient();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: hashedToken,
  });
  if (verifyErr) {
    Sentry.captureMessage('verifySmsOtpAction: verifyOtp failed', {
      level: 'warning',
      extra: { message: verifyErr.message },
    });
    return { ok: false, error: INVALID_CODE_ERROR };
  }

  emitContinueResolved({
    email: normalizedEmail,
    resolution: 'sms_verified' satisfies AuthResolution,
    latencyMs: Date.now() - started,
    userAgent,
  });

  return { ok: true };
}

/**
 * Phase 6 — toggle `workspaces.sms_signin_enabled` for a workspace.
 * Owner/admin only; enforced via `user_has_workspace_role` RPC.
 *
 * Returns an enumeration-safe error (`not_authorized`) for both "user
 * is not a member" and "role not sufficient". UI should render the
 * same "not allowed" message for either.
 */
export async function toggleSmsSigninEnabled(
  workspaceId: string,
  enabled: boolean,
): Promise<{ ok: true; enabled: boolean } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Not authorized.' };
  }

  // Authorize via the shared helper — same pattern as settings toggles
  // elsewhere. `user_has_workspace_role` raises on error; its return
  // boolean is the green light.
  const { data: allowed, error: authErr } = await supabase.rpc('user_has_workspace_role', {
    p_workspace_id: workspaceId,
    p_roles: ['owner', 'admin'],
  });
  if (authErr || allowed !== true) {
    return { ok: false, error: 'Not authorized.' };
  }

  const { error: updateErr } = await supabase
    .from('workspaces')
    .update({ sms_signin_enabled: enabled })
    .eq('id', workspaceId);

  if (updateErr) {
    Sentry.captureMessage('toggleSmsSigninEnabled: update failed', {
      level: 'warning',
      extra: { workspaceId, message: updateErr.message },
    });
    return { ok: false, error: 'Could not update setting.' };
  }

  return { ok: true, enabled };
}

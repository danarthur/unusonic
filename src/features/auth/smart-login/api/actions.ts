/**
 * Smart Login Feature - Server Actions
 * Production-grade authentication with state restoration
 * @module features/auth/smart-login/api/actions
 */

'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import {
  sendMagicLinkSignIn,
  sendGhostClaimEmail,
  sendUnknownEmailSignupEmail,
} from '@/shared/api/email/send';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import {
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS,
} from '@/shared/lib/constants';
import { classifyUserAgent } from '@/shared/lib/auth/classify-user-agent';
import { hashEmailForTelemetry } from '@/shared/lib/auth/hash-email-for-telemetry';
import { loginSchema, signupSchema, signupForPasskeySchema, otpEmailSchema, otpVerifySchema } from '../model/schema';
import type { AuthState, ProfileStatus } from '../model/types';
import type { AuthContinueResolution } from '@/entities/auth/model/types';
import {
  emitContinueResolved,
  emitGhostMatch,
  type AuthResolution,
} from '../lib/auth-telemetry';
import { checkMagicLinkRateLimit } from '../lib/magic-link-rate-limit';
import { runDummyCompare, delayToFloor } from '../lib/enumeration-guard';

/**
 * Best-effort read of the request's User-Agent header. Returns null
 * outside a request context (e.g. test runs) instead of throwing.
 * Used by the Phase 0 shadow telemetry so auth actions never fail for
 * telemetry reasons.
 */
async function readUserAgent(): Promise<string | null> {
  try {
    const h = await headers();
    return h.get('user-agent');
  } catch {
    return null;
  }
}

/**
 * Best-effort request IP read. Honours `x-forwarded-for` (first hop),
 * then `x-real-ip`. Returns null outside request context — rate limit
 * callers treat null as "IP bucket unavailable, rely on email bucket".
 */
async function readRequestIp(): Promise<string | null> {
  try {
    const h = await headers();
    const fwd = h.get('x-forwarded-for');
    if (fwd) return fwd.split(',')[0]?.trim() ?? null;
    return h.get('x-real-ip');
  } catch {
    return null;
  }
}

/** Generates a cryptographically random password that satisfies schema (8+ chars, 1 upper, 1 number). */
function randomPassword(): string {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const pool = lower + digits;

  const buf = new Uint32Array(14);
  crypto.getRandomValues(buf);
  const chars = Array.from(buf, (n) => pool[n % pool.length]);

  // Guarantee at least one uppercase and one digit
  const upBuf = new Uint32Array(2);
  crypto.getRandomValues(upBuf);
  chars.push(upper[upBuf[0] % upper.length]);
  chars.push(digits[upBuf[1] % digits.length]);

  // Fisher-Yates shuffle with CSPRNG
  const shuffleBuf = new Uint32Array(chars.length);
  crypto.getRandomValues(shuffleBuf);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = shuffleBuf[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

const initialState: AuthState = {
  status: 'idle',
  message: null,
  error: null,
  redirect: null,
};

/**
 * Creates a new user account and redirects to onboarding
 * 
 * Flow:
 * 1. Validate input (email, password, name)
 * 2. Create user in Supabase Auth
 * 3. Profile is auto-created by database trigger
 * 4. Redirect to /onboarding
 */
export async function signUpAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  // Parse and validate input
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
  };
  const redirectTo = (formData.get('redirectTo') as string)?.trim() || null;

  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      message: null,
      error: parsed.error.issues[0]?.message || 'Invalid input',
      redirect: null,
    };
  }

  const { email, password, fullName } = parsed.data;

  // Create user in Supabase Auth
  const supabase = await createClient();
  
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  });

  if (authError) {
    // Handle specific error cases
    if (authError.message.includes('already registered')) {
      return {
        status: 'error',
        message: null,
        error: 'An account with this email already exists. Try signing in instead.',
        redirect: null,
      };
    }
    
    return {
      status: 'error',
      message: null,
      error: authError.message || 'Failed to create account',
      redirect: null,
    };
  }

  if (!authData.user) {
    return {
      status: 'error',
      message: null,
      error: 'Failed to create account',
      redirect: null,
    };
  }

  // Note: Profile is automatically created by database trigger (handle_new_user)
  // The trigger populates: id, email, full_name from auth user metadata

  // If a redirectTo is specified (e.g. /claim/[token] for employee invites),
  // go there instead of onboarding. The claim flow handles workspace setup.
  const destination = redirectTo && redirectTo.startsWith('/') ? redirectTo : '/onboarding';
  redirect(destination);
}

/**
 * Creates a new user account (programmatic) and redirects to onboarding.
 * For genesis-style sign-up flow.
 */
export async function signUpWithPayload(payload: {
  email: string;
  fullName: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = signupSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }

  const { email, password, fullName } = parsed.data;
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return {
        ok: false,
        error: 'An account with this email already exists. Try signing in instead.',
      };
    }
    return { ok: false, error: authError.message };
  }

  if (!authData.user) {
    return { ok: false, error: 'Failed to create account' };
  }

  redirect('/onboarding');
}

/**
 * Creates a new user account for passkey-only signup (random password, no redirect).
 * Client must then call registerPasskey() and redirect to /onboarding.
 */
export async function signUpForPasskey(payload: {
  email: string;
  fullName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = signupForPasskeySchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }

  const { email, fullName } = parsed.data;
  const password = randomPassword();
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (authError) {
    if (authError.message.includes('already registered')) {
      return {
        ok: false,
        error: 'An account with this email already exists. Try signing in instead.',
      };
    }
    return { ok: false, error: authError.message };
  }

  if (!authData.user) {
    return { ok: false, error: 'Failed to create account' };
  }

  return { ok: true };
}

/**
 * Authenticates user and redirects based on onboarding status
 * 
 * Flow:
 * 1. Validate credentials
 * 2. Authenticate with Supabase
 * 3. Check profile.onboarding_completed
 * 4. Redirect to /onboarding or /dashboard
 */
export async function signInAction(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const started = Date.now();
  const userAgent = await readUserAgent();

  // Parse and validate input
  const raw = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    // Malformed input: not a resolvable Continue press. Skip telemetry.
    return {
      status: 'error',
      message: null,
      error: parsed.error.issues[0]?.message || 'Invalid input',
      redirect: null,
    };
  }

  const { email, password } = parsed.data;

  // Authenticate with Supabase
  const supabase = await createClient();

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (authError || !authData.user) {
    // Mirror enumeration-safe classification: from the telemetry lens,
    // a failed password sign-in today looks equivalent to the new
    // card's "unknown" resolution (server declined to establish a
    // session). The `flag_snapshot` keeps this row interpretable.
    emitContinueResolved({
      email,
      resolution: 'unknown',
      latencyMs: Date.now() - started,
      userAgent,
    });
    return {
      status: 'error',
      message: null,
      error: authError?.message || 'Authentication failed',
      redirect: null,
    };
  }

  // Check profile status for routing
  const profileStatus = await checkProfileStatus(supabase, authData.user.id);

  // Determine redirect destination (support both 'redirect' and 'next' hidden fields)
  let redirectPath: string;
  const rawNext = (formData.get('redirect') ?? formData.get('next')) as string | null;
  const sanitizedNext = sanitizeRedirectPath(rawNext);

  if (sanitizedNext?.startsWith('/claim') || sanitizedNext?.startsWith('/confirm')) {
    // Employee invite claim flow — let them reach the claim page
    // even if onboarding isn't complete. Claim acceptance sets onboarding_completed.
    redirectPath = sanitizedNext;
  } else if (!profileStatus.exists || !profileStatus.onboardingCompleted) {
    redirectPath = '/onboarding';
  } else if (sanitizedNext) {
    redirectPath = sanitizedNext;
  } else {
    redirectPath = '/lobby';
  }

  const trustDevice = formData.get('trustDevice');
  if (trustDevice === '1' || trustDevice === 'true') {
    const cookieStore = await cookies();
    cookieStore.set(TRUSTED_DEVICE_COOKIE_NAME, 'true', {
      path: '/',
      maxAge: TRUSTED_DEVICE_COOKIE_MAX_AGE_SECONDS,
      sameSite: 'lax',
    });
  }

  // Emit before redirect() throws. A successful password sign-in in
  // Phase 0 shadow maps to `passkey` resolution — the user
  // authenticated directly, with no email fallback needed. The new
  // state machine routes the same "has credentials on file" cohort
  // through the passkey bucket.
  emitContinueResolved({
    email,
    resolution: 'passkey',
    latencyMs: Date.now() - started,
    userAgent,
  });

  redirect(redirectPath);
}

/**
 * Sanitize redirect path: allow only relative paths (no protocol, no //).
 * Prevents open redirect vulnerabilities.
 */
function sanitizeRedirectPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (trimmed === '' || trimmed === '/login' || trimmed === '/signup') return null;
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
}

/**
 * Checks if user profile exists and onboarding is complete
 */
async function checkProfileStatus(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ProfileStatus> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('onboarding_completed, full_name')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // A real error here (RLS block, connectivity, schema drift) must not be
    // silently treated as "no profile" — that sends new users to /onboarding
    // unnecessarily or, worse, masks a broken deploy.
    Sentry.captureMessage('checkProfileStatus: profile read failed', {
      level: 'warning',
      extra: { userId, code: error.code, message: error.message },
    });
  }

  if (!profile) {
    return {
      exists: false,
      onboardingCompleted: false,
      fullName: null,
    };
  }

  return {
    exists: true,
    onboardingCompleted: profile.onboarding_completed || false,
    fullName: profile.full_name,
  };
}

/**
 * Non-redirect version for client-side use
 */
export async function signOut(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

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

// ────────────────────────────────────────────────────────────────────
// Phase 4 — Continue-button dispatcher (`resolveContinueAction`)
// ────────────────────────────────────────────────────────────────────

/**
 * Narrow result for an authed-user lookup. `null` when nothing matched;
 * otherwise the user id and whether they have any passkeys registered.
 *
 * Kept minimal on purpose — the dispatcher never surfaces any of these
 * fields to the caller, so there is no need to pass workspace/role
 * scaffolding through the lookup path.
 */
type AuthUserLookup =
  | { userId: string; hasPasskey: boolean }
  | null;

/**
 * Look up an email in `auth.users` via the Supabase admin REST API —
 * same pattern used by `src/app/api/auth/passkey/authenticate/options/route.ts`
 * because `getUserByEmail` does not exist on `@supabase/auth-js` v2.x.
 *
 * Returns `null` for any non-match or any transport failure. The
 * dispatcher degrades gracefully to the "no account" branch on error
 * so a transient upstream outage does not leak existence through a
 * different error code.
 */
async function lookupAuthUserByEmail(
  normalizedEmail: string,
): Promise<AuthUserLookup> {
  try {
    const system = getSystemClient();
    // GoTrue's `/admin/users?email=...` REST param is NOT a filter (verified
    // 2026-04-19: it ignores the param and returns the first user in the
    // table). Use the project's `get_user_id_by_email` SECURITY DEFINER RPC
    // instead — anon cannot execute, service role can.
    const { data: userId } = await system.rpc('get_user_id_by_email', {
      user_email: normalizedEmail,
    });
    if (!userId) return null;

    // Passkey presence — separate table lookup. Service role bypasses RLS.
    const { count, error: passkeyError } = await system
      .from('passkeys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId as string);

    if (passkeyError) {
      // Fail-closed on passkey presence: treat as "no passkey" (magic-link path).
      return { userId: userId as string, hasPasskey: false };
    }
    return { userId: userId as string, hasPasskey: (count ?? 0) > 0 };
  } catch {
    return null;
  }
}

/**
 * Look up an unclaimed ghost entity in `directory.entities` matching
 * the given email. Returns `null` if no ghost matches or on transport
 * failure. Never returns details to the caller — the dispatcher does
 * not expose any property of the ghost to the response.
 */
async function lookupGhostEntityByEmail(
  normalizedEmail: string,
): Promise<{ entityId: string } | null> {
  try {
    const system = getSystemClient();
    // `directory` schema is not in PostgREST's exposed schemas by default
    // (see CLAUDE.md). Cast to any to reach the schema() call that is
    // standard elsewhere in server actions.
    const { data, error } = await (system as unknown as {
      schema: (s: string) => ReturnType<typeof system.from>;
    })
      .schema('directory')
      .from('entities')
      .select('id')
      // Lowercased email is matched in the email column. Directory stores
      // emails lowercased on insert; mirror that here.
      .eq('entity_type', 'person')
      .is('claimed_by_user_id', null)
      .filter('attributes->>email', 'eq', normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (error || !data?.id) return null;
    return { entityId: data.id as string };
  } catch {
    return null;
  }
}

/**
 * Phase 4 — the Continue-button dispatcher.
 *
 * Frozen spec: `docs/reference/login-redesign-design.md` §3 + §3.1.
 *
 * This action is the enumeration-guarded entry point the new sign-in
 * card calls the moment the user presses Continue with a valid-looking
 * email. It returns a deliberately narrow discriminated union:
 *
 *   - `{ kind: 'passkey' }`     — a passkey is registered; UI should
 *     invoke the WebAuthn ceremony.
 *   - `{ kind: 'magic-link' }`  — the caller-visible outcome for ALL
 *     three non-passkey branches (account-exists / ghost-match /
 *     unknown). The email itself carries the differentiation.
 *
 * ## Non-negotiable invariants
 *
 * 1. **Always lookup.** Both `auth.users` and `directory.entities` are
 *    queried on every call, even when the first lookup already decides
 *    the branch. Keeps wall-clock cost symmetric across branches.
 * 2. **Dummy compare.** A fixed-cost hash loop (`runDummyCompare`) runs
 *    unconditionally before any branch decision so the "miss" path is
 *    not measurably faster than the "hit" path.
 * 3. **Rate limit.** IP + email-hash dual bucket via
 *    `checkMagicLinkRateLimit` (10/min/IP, 5/min/email). Both throttles
 *    map to the same `{ kind: 'magic-link' }` response with no scope
 *    leak.
 * 4. **Jitter floor.** Non-passkey responses sleep until
 *    `max(400ms, elapsed) + 0-50ms` before returning. Passkey branch is
 *    fast because WebAuthn itself dominates the user-perceived latency.
 * 5. **Identical response shape.** All three non-passkey branches
 *    return `{ kind: 'magic-link' }` — same JSON, same latency bucket,
 *    same side effects (one email, one telemetry event). Auditable by
 *    the unit test `resolveContinue.enumeration-guard.test.ts`.
 * 6. **Ghost-match telemetry.** When a ghost matches, we emit a
 *    separate `ghost_match_on_signin` event (hashed email only) so a
 *    spike in ghost-match rate against a single IP or UA class can
 *    alert without a user-visible signal.
 *
 * The caller MUST treat the return value as opaque — do NOT branch UI
 * on anything other than `kind`. Session-expired is not returned from
 * here (see §3 — it's a separate mount-time code path).
 *
 * Malformed input returns `{ kind: 'unknown' }` WITHOUT triggering a
 * lookup. Attackers can already distinguish valid-email-regex from
 * invalid client-side; no new leak. `unknown` is a valid
 * caller-visible kind for this boundary only — it means "do not
 * proceed" (e.g. the schema rejected the email). The three
 * post-validation branches all map to `magic-link`.
 */
export async function resolveContinueAction(
  email: string,
): Promise<AuthContinueResolution> {
  const started = Date.now();
  const userAgent = await readUserAgent();
  const requestIp = await readRequestIp();

  // ── 1. Validate. Malformed email is NOT a resolvable press. ────────
  const parsed = otpEmailSchema.safeParse({ email });
  if (!parsed.success) {
    // No lookup, no dummy compare, no jitter — caller already sees a
    // regex-gated UI state, so the invalid-email path is not part of
    // the enumeration surface.
    return { kind: 'unknown' };
  }
  const normalizedEmail = parsed.data.email;
  const emailHash = hashEmailForTelemetry(normalizedEmail);

  // ── 2. Dummy compare — ALWAYS runs, regardless of branch. ──────────
  // Retain the result to a local so V8 cannot treat the work as dead.
  // Per `docs/reference/login-redesign-design.md` §3.1 requirement (2).
  const _dummy = runDummyCompare(normalizedEmail);
  void _dummy;

  // ── 3. Rate limit — BEFORE the DB hits. ────────────────────────────
  // Both throttle scopes map to the identical `magic-link` response;
  // `scope` is only used for Sentry telemetry so spike detection works.
  const rate = checkMagicLinkRateLimit({ ip: requestIp, emailHash });
  if (!rate.allowed) {
    Sentry.logger.info('auth.resolveContinue.rateLimited', {
      scope: rate.scope,
      retryAfterSeconds: rate.retryAfterSeconds,
    });
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'rate_limited' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    // Rate-limited callers see the same "check your email" response.
    // No email is actually sent — the wall time up to this point is
    // floor-normalized so the throttled branch cannot be distinguished
    // from the allowed branch by latency.
    await delayToFloor(Date.now() - started);
    return { kind: 'magic-link' };
  }

  // ── 4. Always-lookup both surfaces. ────────────────────────────────
  // Parallel — neither lookup is privileged, and serializing them would
  // widen the latency envelope enough for an attacker to estimate
  // which branch won just from p50 vs p95 delta.
  const [authLookup, ghostLookup] = await Promise.all([
    lookupAuthUserByEmail(normalizedEmail),
    lookupGhostEntityByEmail(normalizedEmail),
  ]);

  // ── 5. Passkey branch — fast path. ────────────────────────────────
  // Skips the jitter floor because WebAuthn latency on the client
  // already dominates the user-perceived timing. Enumeration risk here
  // is already established: if an email has a passkey, the browser's
  // own prompt reveals that. The guard applies to the magic-link
  // branches.
  if (authLookup?.hasPasskey) {
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'passkey' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    return { kind: 'passkey' };
  }

  // ── 6. Pick email template per branch. ────────────────────────────
  // Caller NEVER sees which template fired — the return value is the
  // same `{ kind: 'magic-link' }` across all three.
  const baseUrlStr = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    .replace(/\/$/, '');
  const system = getSystemClient();

  // Decide before sending, so telemetry classification is deterministic.
  type Branch = 'account' | 'ghost' | 'unknown';
  const branch: Branch = authLookup
    ? 'account'
    : ghostLookup
      ? 'ghost'
      : 'unknown';

  if (branch === 'ghost') {
    // Spike-detection signal. Hashed email only. Safe to emit before
    // the jitter floor because telemetry is buffered, not in-band.
    emitGhostMatch({ email: normalizedEmail, userAgent });
  }

  // Generate a Supabase magic link for account-exists and ghost-match.
  // For `unknown`, we send a signup CTA email — no magic link needed,
  // the link is a plain signup URL.
  if (branch === 'account') {
    const { data: linkData, error: linkError } = await system.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        redirectTo: `${baseUrlStr}/login`,
      },
    });

    if (linkError || !linkData?.properties?.action_link) {
      Sentry.logger.warn('auth.resolveContinue.generateLinkFailed', {
        code: linkError?.message,
      });
      // Even on upstream failure we preserve the enumeration-safe
      // response shape. Emit telemetry as `unknown` to keep the
      // rollout dashboard interpretable.
      emitContinueResolved({
        email: normalizedEmail,
        resolution: 'unknown' satisfies AuthResolution,
        latencyMs: Date.now() - started,
        userAgent,
      });
      await delayToFloor(Date.now() - started);
      return { kind: 'magic-link' };
    }

    const emailResult = await sendMagicLinkSignIn({
      targetEmail: normalizedEmail,
      magicLinkUrl: linkData.properties.action_link,
      expiresMinutes: 60,
      userAgentClass: classifyUserAgent(userAgent),
    });
    if (!emailResult.ok) {
      Sentry.logger.warn('auth.resolveContinue.emailFailed', {
        error: emailResult.error,
      });
    }
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'magic_link' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    await delayToFloor(Date.now() - started);
    return { kind: 'magic-link' };
  }

  if (branch === 'ghost') {
    const { data: linkData, error: linkError } = await system.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
      options: {
        // Claim surface resolves the ghost by the token's embedded email.
        redirectTo: `${baseUrlStr}/login`,
      },
    });

    // The link URL is what the user clicks. We pass the Supabase action
    // URL directly — the (auth) layout's hash handler will establish a
    // session and then the app can route the now-authed user toward
    // their ghost claim. If Supabase surfaces a failure we still return
    // the same shape.
    const claimUrl =
      !linkError && linkData?.properties?.action_link
        ? linkData.properties.action_link
        : `${baseUrlStr}/login`;

    const emailResult = await sendGhostClaimEmail({
      targetEmail: normalizedEmail,
      claimUrl,
      expiresMinutes: 60,
    });
    if (!emailResult.ok) {
      Sentry.logger.warn('auth.resolveContinue.ghostEmailFailed', {
        error: emailResult.error,
      });
    }
    emitContinueResolved({
      email: normalizedEmail,
      resolution: 'magic_link' satisfies AuthResolution,
      latencyMs: Date.now() - started,
      userAgent,
    });
    await delayToFloor(Date.now() - started);
    return { kind: 'magic-link' };
  }

  // branch === 'unknown'
  const signupUrl = `${baseUrlStr}/signup?email=${encodeURIComponent(normalizedEmail)}`;
  const emailResult = await sendUnknownEmailSignupEmail({
    targetEmail: normalizedEmail,
    signupUrl,
  });
  if (!emailResult.ok) {
    Sentry.logger.warn('auth.resolveContinue.unknownEmailFailed', {
      error: emailResult.error,
    });
  }
  emitContinueResolved({
    email: normalizedEmail,
    resolution: 'magic_link' satisfies AuthResolution,
    latencyMs: Date.now() - started,
    userAgent,
  });
  await delayToFloor(Date.now() - started);
  return { kind: 'magic-link' };
}

/**
 * Smart Login — Phase 4 Continue-button dispatcher.
 *
 * Owns: `resolveContinueAction` and its enumeration-guarded lookup
 * helpers. Frozen spec: `docs/reference/login-redesign-design.md` §3 +
 * §3.1.
 *
 * The lookup helpers (`lookupAuthUserByEmail`, `lookupGhostEntityByEmail`)
 * are intentionally NOT exported — they are not server actions and the
 * dispatcher is the only caller.
 *
 * @module features/auth/smart-login/api/actions/resolve-continue
 */
'use server';

import * as Sentry from '@sentry/nextjs';
import { getSystemClient } from '@/shared/api/supabase/system';
import {
  sendMagicLinkSignIn,
  sendGhostClaimEmail,
  sendUnknownEmailSignupEmail,
} from '@/shared/api/email/send';
import { classifyUserAgent } from '@/shared/lib/auth/classify-user-agent';
import { hashEmailForTelemetry } from '@/shared/lib/auth/hash-email-for-telemetry';
import { otpEmailSchema } from '../../model/schema';
import type { AuthContinueResolution } from '@/entities/auth/model/types';
import {
  emitContinueResolved,
  emitGhostMatch,
  type AuthResolution,
} from '../../lib/auth-telemetry';
import { checkMagicLinkRateLimit } from '../../lib/magic-link-rate-limit';
import { runDummyCompare, delayToFloor } from '../../lib/enumeration-guard';
import { readUserAgent, readRequestIp } from './_helpers';

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

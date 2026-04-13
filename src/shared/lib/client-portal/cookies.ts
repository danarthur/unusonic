/**
 * Client portal cookies — names, options, read/write.
 *
 * Cookie strategy per client-portal-design.md §14.7 + §15:
 * - HttpOnly, Secure, SameSite=Lax (email-link entry requires Lax, not Strict)
 * - Max-Age mirrors client_portal_tokens.expires_at (event-lifetime TTL)
 * - Path=/ so it applies to all (client-portal) routes
 * - Server-set only (never document.cookie) — unlocks non-7d Safari behavior
 *
 * @module shared/lib/client-portal/cookies
 */
import 'server-only';

import { cookies } from 'next/headers';

/**
 * httpOnly cookie name for the client portal session token.
 * The value is the raw 64-char hex token; the DB stores only SHA-256 of it.
 */
export const CLIENT_PORTAL_SESSION_COOKIE = 'unusonic_client_session';

/**
 * httpOnly cookie name for the step-up JWT claim.
 * Contains { step_up_until: ISO, step_up_method: 'otp' | 'passkey' }.
 *
 * Short-lived and **sliding** — bumped to 30 minutes on 2026-04-10 per
 * the Songs slice §0 A6. Every successful `requireStepUp()` call refreshes
 * the expiry, so a couple building a 20-song list in one sitting sees at
 * most one OTP prompt. See `step-up.ts` for the refresh mechanics.
 */
export const CLIENT_PORTAL_STEP_UP_COOKIE = 'unusonic_client_step_up';

/** Hard ceiling matches compute_client_session_expiry() — 365 days in seconds. */
export const CLIENT_PORTAL_MAX_COOKIE_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Step-up JWT claim TTL in seconds — **30 minutes**, sliding.
 *
 * Bumped from 15 minutes on 2026-04-10 per Songs design §0 A6. The sliding
 * refresh lives in `requireStepUp()`; this constant is only the window
 * length, not a hard expiry. A couple who keeps interacting with the
 * portal within any 30-minute gap stays stepped-up indefinitely until the
 * session itself expires.
 */
export const CLIENT_PORTAL_STEP_UP_TTL_SECONDS = 60 * 30;

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
};

function baseCookieOptions(maxAgeSeconds: number): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: Math.min(maxAgeSeconds, CLIENT_PORTAL_MAX_COOKIE_AGE_SECONDS),
  };
}

/**
 * Reads the raw session token from the cookie jar.
 * Returns null if absent. Never logs the value.
 */
export async function readSessionCookie(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(CLIENT_PORTAL_SESSION_COOKIE)?.value ?? null;
}

/**
 * Sets the session cookie. Caller is responsible for passing the raw token
 * from client_mint_session_token — never a hash, never a token already
 * persisted somewhere else.
 *
 * @param rawToken - 64-char hex token returned by client_mint_session_token
 * @param expiresAt - Absolute expiry from the RPC; cookie maxAge is derived
 */
export async function setSessionCookie(rawToken: string, expiresAt: Date): Promise<void> {
  const maxAgeSeconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - Date.now()) / 1000),
  );
  const jar = await cookies();
  jar.set(CLIENT_PORTAL_SESSION_COOKIE, rawToken, baseCookieOptions(maxAgeSeconds));
}

/**
 * Clears the session cookie. Called on client logout.
 * Does NOT revoke the DB row — callers should also call client_revoke_session_token.
 */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(CLIENT_PORTAL_SESSION_COOKIE);
}

/**
 * Reads the step-up claim JSON from the cookie jar.
 * Returns null if absent, malformed, or expired.
 */
export async function readStepUpCookie(): Promise<{
  stepUpUntil: Date;
  stepUpMethod: 'otp' | 'passkey';
} | null> {
  const jar = await cookies();
  const raw = jar.get(CLIENT_PORTAL_STEP_UP_COOKIE)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { stepUpUntil?: string; stepUpMethod?: string };
    if (!parsed.stepUpUntil || !parsed.stepUpMethod) return null;
    const until = new Date(parsed.stepUpUntil);
    if (Number.isNaN(until.getTime()) || until.getTime() < Date.now()) return null;
    if (parsed.stepUpMethod !== 'otp' && parsed.stepUpMethod !== 'passkey') return null;
    return { stepUpUntil: until, stepUpMethod: parsed.stepUpMethod };
  } catch {
    return null;
  }
}

/**
 * Sets (or refreshes) the step-up cookie.
 *
 * Called in two places:
 *   1. After a successful OTP / passkey challenge — promotes a session
 *      to "stepped-up" state (the initial set).
 *   2. Inside `requireStepUp()` on every successful check — slides the
 *      expiry forward by another full TTL window (§0 A6 refresh).
 *
 * Stamps `stepUpUntil = now + CLIENT_PORTAL_STEP_UP_TTL_SECONDS`. The
 * caller does NOT supply the expiry — this is the one place in the
 * client portal that computes a step-up deadline, so the sliding
 * behavior can't drift between callers.
 */
export async function setStepUpCookie(method: 'otp' | 'passkey'): Promise<void> {
  const stepUpUntil = new Date(Date.now() + CLIENT_PORTAL_STEP_UP_TTL_SECONDS * 1000);
  const jar = await cookies();
  jar.set(
    CLIENT_PORTAL_STEP_UP_COOKIE,
    JSON.stringify({ stepUpUntil: stepUpUntil.toISOString(), stepUpMethod: method }),
    baseCookieOptions(CLIENT_PORTAL_STEP_UP_TTL_SECONDS),
  );
}

/** Clears the step-up cookie. */
export async function clearStepUpCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(CLIENT_PORTAL_STEP_UP_COOKIE);
}

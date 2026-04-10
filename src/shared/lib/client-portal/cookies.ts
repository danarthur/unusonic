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
 * Short-lived (15 minutes) per §15.4.
 */
export const CLIENT_PORTAL_STEP_UP_COOKIE = 'unusonic_client_step_up';

/** Hard ceiling matches compute_client_session_expiry() — 365 days in seconds. */
export const CLIENT_PORTAL_MAX_COOKIE_AGE_SECONDS = 60 * 60 * 24 * 365;

/** Step-up JWT claim TTL in seconds — 15 minutes per §15.4. */
export const CLIENT_PORTAL_STEP_UP_TTL_SECONDS = 60 * 15;

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
 * Sets the step-up cookie after a successful OTP or passkey challenge.
 * 15-minute TTL per §15.4.
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

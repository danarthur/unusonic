/**
 * Deterministic, salted SHA-256 hash of an email address for telemetry.
 *
 * We never log raw email addresses in auth telemetry. A salted hash lets
 * us correlate events from the same user across a session without PII.
 * The salt is server-only (env var `AUTH_TELEMETRY_SALT`); with the salt
 * compromised a brute-force of common email patterns becomes feasible,
 * so this is defense-in-depth, not a privacy guarantee.
 *
 * ## Normalization
 *
 * Emails are lowercased and trimmed before hashing so
 * `Foo@Example.com ` and `foo@example.com` hash identically. We do NOT
 * strip plus-addressing (`foo+bar@example.com` stays distinct) because
 * Unusonic treats those as separate accounts at the auth layer.
 *
 * ## Missing salt
 *
 * In production the salt must be present; callers should configure it
 * via the platform env. In dev or test we fall back to a deterministic
 * marker value and warn on stderr so the warning surfaces without
 * crashing a local dev loop. The fallback value is NEVER used in
 * production because deployed environments always set the salt.
 *
 * @module shared/lib/auth/hash-email-for-telemetry
 */

import 'server-only';
import { createHash } from 'node:crypto';

/**
 * Deterministic-but-clearly-dev marker. Used when `AUTH_TELEMETRY_SALT`
 * is unset. Exported for tests; callers should never reference this.
 */
export const DEV_SALT_FALLBACK = 'unusonic-dev-only-telemetry-salt-DO-NOT-USE-IN-PROD';

let devWarningEmitted = false;

function resolveSalt(env: Record<string, string | undefined> = process.env): string {
  const salt = env.AUTH_TELEMETRY_SALT;
  if (typeof salt === 'string' && salt.length > 0) {
    return salt;
  }
  if (!devWarningEmitted) {
    console.warn(
      '[auth-telemetry] AUTH_TELEMETRY_SALT is not set. Using dev-only fallback. ' +
        'This MUST be configured in production.',
    );
    devWarningEmitted = true;
  }
  return DEV_SALT_FALLBACK;
}

/**
 * Returns a lowercase hex SHA-256 digest of `salt || ':' || normalized(email)`.
 * Deterministic for a given salt + email pair.
 *
 * @param email Raw email from form input. Safe to pass untrimmed/mixed-case.
 * @param env Optional env override for tests.
 * @returns 64-char lowercase hex string, or empty string if email is not a string.
 */
export function hashEmailForTelemetry(
  email: string,
  env: Record<string, string | undefined> = process.env,
): string {
  if (typeof email !== 'string') return '';
  const normalized = email.trim().toLowerCase();
  if (normalized.length === 0) return '';
  const salt = resolveSalt(env);
  return createHash('sha256').update(`${salt}:${normalized}`).digest('hex');
}

/**
 * Resets the one-shot dev-warning flag. Test-only. Exported so unit
 * tests can exercise the warning path without stateful bleed between
 * `describe` blocks.
 */
export function __resetDevWarningForTests(): void {
  devWarningEmitted = false;
}

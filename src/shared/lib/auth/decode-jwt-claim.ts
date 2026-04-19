/**
 * Decode the full payload of a Supabase JWT access token without
 * validating the signature.
 *
 * **This is NOT a trust boundary.** The returned claim must only be used
 * for cosmetic decisions (e.g. pre-filling the email field on the
 * session-expired login variant). Never gate access on anything this
 * function returns — an expired or tampered token can produce an
 * arbitrary claim and the signature check is entirely skipped.
 *
 * Sibling of `decode-jwt-exp.ts`, which returns just the `exp` field.
 * This one returns the whole payload so callers (e.g. the login page's
 * email pre-fill on `?reason=session_expired`) can read `email` without
 * a second round-trip.
 *
 * Returns `null` on any parse failure — never throws. Safe to call in
 * render paths.
 *
 * @module shared/lib/auth/decode-jwt-claim
 */

/**
 * Shape of the Supabase access-token claim we care about. Everything is
 * optional because the unvalidated token can be missing any field.
 */
export type SupabaseJwtClaim = {
  sub?: string;
  email?: string;
  phone?: string;
  exp?: number;
  iat?: number;
  aud?: string;
  role?: string;
  [key: string]: unknown;
};

/**
 * Decode a JWT's payload (the middle segment) as a JSON object. Returns
 * `null` on any failure: not a 3-part string, bad base64url, malformed
 * JSON, non-object result, etc.
 *
 * The decode runs at both browser and server runtimes — we use
 * `globalThis.atob` with a Buffer fallback so the same module works in
 * edge/node without pulling a polyfill.
 */
export function decodeJwtClaim(token: unknown): SupabaseJwtClaim | null {
  if (typeof token !== 'string' || token.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    // base64url → base64
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    // Pad so atob accepts it. base64url strips trailing '='.
    const padLen = (4 - (b64.length % 4)) % 4;
    const padded = b64 + '='.repeat(padLen);

    let json: string;
    if (typeof globalThis.atob === 'function') {
      json = globalThis.atob(padded);
    } else if (typeof Buffer !== 'undefined') {
      json = Buffer.from(padded, 'base64').toString('utf8');
    } else {
      return null;
    }

    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as SupabaseJwtClaim;
  } catch {
    return null;
  }
}

/**
 * Convenience: pull just the email from a Supabase JWT. Returns `null`
 * if the token cannot be decoded or the claim has no email.
 *
 * Use case: pre-filling the login card's email field on
 * `/login?reason=session_expired` when the expired `sb-*` cookie is
 * still present. We never trust this value for authorization — it only
 * drives cosmetic copy and the email input placeholder.
 */
export function readEmailFromJwt(token: unknown): string | null {
  const claim = decodeJwtClaim(token);
  if (!claim) return null;
  const email = typeof claim.email === 'string' ? claim.email.trim() : '';
  if (email.length === 0) return null;
  return email.toLowerCase();
}

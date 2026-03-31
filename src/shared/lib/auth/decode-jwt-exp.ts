/**
 * Decode the `exp` (expiry) field from a Supabase JWT access token.
 *
 * This is a **local-only, no-crypto** decode — we just need the expiry
 * timestamp to decide whether a proactive refresh is worthwhile.
 * The server validates signatures; this is purely a client-side optimisation
 * to avoid unnecessary network calls.
 *
 * @returns Unix timestamp (seconds) or null if the token is unparseable.
 * @module shared/lib/auth/decode-jwt-exp
 */

export function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // Base64url → Base64 → decode
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(payload);
    const data = JSON.parse(json) as { exp?: number };
    return typeof data.exp === 'number' ? data.exp : null;
  } catch {
    return null;
  }
}

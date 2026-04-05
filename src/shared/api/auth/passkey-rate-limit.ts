/**
 * Passkey endpoint rate limiting.
 * Uses webauthn_challenges table as a natural rate counter — challenges are
 * already created per-request and cleaned up every 5 minutes by pg_cron.
 *
 * Per-identifier (user_id or email hash) rather than per-IP to avoid
 * blocking production teams on shared office/venue networks.
 *
 * @module shared/api/auth/passkey-rate-limit
 */

import { getSystemClient } from '@/shared/api/supabase/system';

const OPTIONS_LIMIT = 10; // max options requests per window
const VERIFY_LIMIT = 5;   // max verify attempts per window
const WINDOW_MINUTES = 5;

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Check rate limit for passkey options endpoints.
 * Pass userId if available (registration flow), or null for discoverable auth.
 */
export async function checkPasskeyOptionsRate(userId: string | null): Promise<RateLimitResult> {
  if (!userId) return { allowed: true }; // discoverable flow — can't rate limit without identifier
  return checkChallengeRate(userId, OPTIONS_LIMIT);
}

/**
 * Check rate limit for passkey verify endpoints.
 * Uses challenge cleanup count as a proxy — each verify consumes a challenge.
 */
export async function checkPasskeyVerifyRate(userId: string | null): Promise<RateLimitResult> {
  if (!userId) return { allowed: true };
  return checkChallengeRate(userId, VERIFY_LIMIT);
}

async function checkChallengeRate(userId: string, limit: number): Promise<RateLimitResult> {
  const db = getSystemClient();
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { count, error } = await db
    .from('webauthn_challenges')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  if (error) {
    // Fail open — don't block auth on a rate limit query failure
    console.warn('[passkey-rate-limit] Check failed, allowing:', error.message);
    return { allowed: true };
  }

  if ((count ?? 0) >= limit) {
    return { allowed: false, retryAfterSeconds: WINDOW_MINUTES * 60 };
  }

  return { allowed: true };
}

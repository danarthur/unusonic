/**
 * Rate limit helper — wraps client_check_rate_limit RPC.
 *
 * Must be called BEFORE performing the rate-limited action (the RPC writes
 * the action row on each successful check). See client-portal-design.md §15.6.
 *
 * @module shared/lib/client-portal/rate-limit
 */
import 'server-only';

import { createHash } from 'node:crypto';

import { getSystemClient } from '@/shared/api/supabase/system';

export type RateLimitScope =
  | 'magic_link_email'
  | 'magic_link_ip'
  | 'otp_attempt_email'
  | 'otp_attempt_ip'
  // Songs anti-spam scope (added 2026-04-10, client portal Songs slice §0 A7).
  // Per-entity: caps total couple mutations (add + update + delete) at
  // 150/day. Intentionally high — a couple building a list in one sitting
  // easily hits 50-80 mutations and the original first-pass cap of
  // 30/day would have throttled the primary happy path. The spam ceiling
  // lives on the RPC (100-entry hard cap inside client_songs_add_request);
  // this scope is only to stop compromised-cookie abuse bursts.
  | 'song_request_entity';

export type RateLimitResult = {
  allowed: boolean;
  currentCount: number;
  retryAfterSeconds: number;
};

/** Hash an email before using it as a rate-limit key (§15.6). */
export function hashEmailKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

type ScopeConfig = { limit: number; windowSeconds: number };

/** Canonical per-scope limits from §15.6 + Songs design doc §0 A7. */
const SCOPE_DEFAULTS: Record<RateLimitScope, ScopeConfig> = {
  magic_link_email:    { limit: 3,   windowSeconds: 60 * 60 },         // 3/hr (also enforce 10/day separately if needed)
  magic_link_ip:       { limit: 30,  windowSeconds: 60 * 60 },         // 30/hr per IP
  otp_attempt_email:   { limit: 10,  windowSeconds: 60 * 60 },         // 10 failures/hr → workspace alert
  otp_attempt_ip:      { limit: 100, windowSeconds: 60 * 60 },         // 100 failures/hr → 24h IP block
  song_request_entity: { limit: 150, windowSeconds: 24 * 60 * 60 },    // 150/day per entity (Songs A7)
};

/**
 * Check and record a rate-limited action.
 *
 * @param scope - Pre-defined scope; limits come from §15.6
 * @param key   - Opaque per-scope key. For email scopes, pass hashEmailKey(email).
 *                For IP scopes, pass the raw IP string.
 * @param overrides - Optional { limit, windowSeconds } override for tests
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  key: string,
  overrides?: Partial<ScopeConfig>,
): Promise<RateLimitResult> {
  const cfg = { ...SCOPE_DEFAULTS[scope], ...overrides };
  const supabase = getSystemClient();

  const { data, error } = await supabase.rpc('client_check_rate_limit', {
    p_scope: scope,
    p_key: key,
    p_limit: cfg.limit,
    p_window_seconds: cfg.windowSeconds,
  });

  if (error) {
    // Fail closed on DB errors — deny rather than accidentally letting abuse through.
    // eslint-disable-next-line no-console
    console.error('[client-portal/rate-limit] check failed', {
      code: error.code,
      message: error.message,
      scope,
    });
    return { allowed: false, currentCount: 0, retryAfterSeconds: cfg.windowSeconds };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return { allowed: false, currentCount: 0, retryAfterSeconds: cfg.windowSeconds };
  }

  return {
    allowed: row.allowed ?? false,
    currentCount: row.current_count ?? 0,
    retryAfterSeconds: row.retry_after_seconds ?? 0,
  };
}

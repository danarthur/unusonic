/**
 * Shared helpers for smart-login server actions.
 *
 * NOT a `'use server'` file — these helpers include synchronous
 * functions (`randomPassword`, `sanitizeRedirectPath`) which cannot be
 * exported from a 'use server' module (Next.js forbids non-async-function
 * exports). The action sibling files import from here freely.
 *
 * @module features/auth/smart-login/api/actions/_helpers
 */
import { headers } from 'next/headers';
import * as Sentry from '@sentry/nextjs';
import type { createClient } from '@/shared/api/supabase/server';
import type { ProfileStatus } from '../../model/types';

/**
 * Best-effort read of the request's User-Agent header. Returns null
 * outside a request context (e.g. test runs) instead of throwing.
 * Used by the Phase 0 shadow telemetry so auth actions never fail for
 * telemetry reasons.
 */
export async function readUserAgent(): Promise<string | null> {
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
export async function readRequestIp(): Promise<string | null> {
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
export function randomPassword(): string {
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

/**
 * Sanitize redirect path: allow only relative paths (no protocol, no //).
 * Prevents open redirect vulnerabilities.
 */
export function sanitizeRedirectPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (trimmed === '' || trimmed === '/login' || trimmed === '/signup') return null;
  if (!trimmed.startsWith('/')) return null;
  if (trimmed.startsWith('//')) return null;
  return trimmed;
}

/**
 * Checks if user profile exists and onboarding is complete.
 * Used by signInAction to decide between /onboarding and /lobby.
 */
export async function checkProfileStatus(
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

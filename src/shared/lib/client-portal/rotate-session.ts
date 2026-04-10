/**
 * Silent session rotation on every use — DB-only, no cookie writes.
 *
 * Called from Server Components (page renders, layouts) where cookie writes
 * are forbidden in Next.js 16. The browser cookie is set once on initial
 * mint with a 365-day Max-Age (the hard ceiling); the DB row's expires_at is
 * the source of truth for the event-lifetime TTL and gets rotated here.
 *
 * If the session is revoked or expired, the caller is responsible for
 * clearing the cookie — typically by redirecting to a route handler that
 * does the cleanup + redirects to /sign-in.
 *
 * See client-portal-design.md §15.1.
 *
 * @module shared/lib/client-portal/rotate-session
 */
import 'server-only';

import { createHash } from 'node:crypto';

import { getSystemClient } from '@/shared/api/supabase/system';

import { readSessionCookie } from './cookies';

export type RotateResult =
  | { ok: true; entityId: string; expiresAt: Date }
  | { ok: false; reason: 'no_cookie' | 'not_found' | 'revoked' | 'expired' | 'error' };

/**
 * Read the cookie and rotate the session in the DB. Does NOT write cookies —
 * safe to call from Server Components.
 */
export async function rotateClientPortalSession(options: {
  ip: string | null;
  userAgent: string | null;
}): Promise<RotateResult> {
  const rawToken = await readSessionCookie();
  if (!rawToken) {
    return { ok: false, reason: 'no_cookie' };
  }

  const tokenHash = createHash('sha256').update(rawToken).digest('hex');

  const supabase = getSystemClient();
  const { data, error } = await supabase.rpc('client_rotate_session_token', {
    p_token_hash: tokenHash,
    p_ip: options.ip ?? undefined,
    p_user_agent: options.userAgent ?? undefined,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[client-portal/rotate] rotate failed', {
      code: error.code,
      message: error.message,
    });
    return { ok: false, reason: 'error' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.ok) {
    return {
      ok: false,
      reason: (row?.reason ?? 'not_found') as 'not_found' | 'revoked' | 'expired',
    };
  }

  return {
    ok: true,
    entityId: row.entity_id,
    expiresAt: new Date(row.expires_at),
  };
}

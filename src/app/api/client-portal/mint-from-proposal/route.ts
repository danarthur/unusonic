/**
 * First-touch session mint handler for proposal public tokens.
 *
 * Flow (see client-portal-design.md §15.1):
 *   1. Client taps /p/<public_token> from vendor email
 *   2. /p/[token]/page.tsx reads session cookie; if missing, redirects here
 *   3. This handler:
 *      - Resolves the proposal → client entity via resolveClientEntityForProposal
 *      - If an entity is resolvable: calls client_mint_session_token, sets cookie
 *      - Redirects back to /p/<public_token>
 *      - If no entity: redirects back without a cookie (anonymous view only)
 *
 * Called as a GET so the redirect chain works from an email-clicked link.
 * Idempotent: if the cookie is already set by the time this runs, the
 * page won't have redirected here, so we shouldn't see that case.
 *
 * @module app/api/client-portal/mint-from-proposal
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

import { getSystemClient } from '@/shared/api/supabase/system';
import {
  CLIENT_PORTAL_SESSION_COOKIE,
  CLIENT_PORTAL_MAX_COOKIE_AGE_SECONDS,
} from '@/shared/lib/client-portal/cookies';
import { resolveClientEntityForProposal } from '@/shared/lib/client-portal/resolve-proposal-entity';
import { logAccess } from '@/shared/lib/client-portal/audit';

function requestIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}

function computeDeviceIdHash(req: NextRequest): string | null {
  const ua = req.headers.get('user-agent') ?? '';
  const lang = req.headers.get('accept-language') ?? '';
  if (!ua && !lang) return null;
  return createHash('sha256').update(`${ua}||${lang}`).digest('hex');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get('token')?.trim();
  if (!token) {
    return NextResponse.json({ error: 'missing_token' }, { status: 400 });
  }

  // The URL we'll redirect back to no matter what
  const destination = new URL(`/p/${token}`, req.url);

  // Helper: build a "no-mint-tried" fallback response. Sets a short-lived
  // marker cookie so the proxy doesn't redirect back here on the next visit.
  const noMintFallback = () => {
    const response = NextResponse.redirect(destination);
    response.cookies.set('unusonic_client_no_mint', '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24h — the proxy retries the next day
    });
    return response;
  };

  // 1. Resolve proposal → client entity
  const resolved = await resolveClientEntityForProposal(token);
  if (!resolved) {
    // Not a viewable proposal — just send them back; the page will 404.
    // No marker cookie: we want the proxy to try again on a future visit
    // in case the proposal gets published between now and then.
    return NextResponse.redirect(destination);
  }

  if (!resolved.clientEntityId) {
    // Lead-stage proposal, no client entity yet. Render anonymously.
    // Set the no-mint marker so we don't bounce forever.
    return noMintFallback();
  }

  // 2. Mint a new session via the RPC
  const supabase = getSystemClient();
  const ip = requestIp(req);
  const deviceIdHash = computeDeviceIdHash(req);

  const { data: mintData, error: mintError } = await supabase.rpc(
    'client_mint_session_token',
    {
      p_entity_id: resolved.clientEntityId,
      p_source_kind: 'proposal',
      p_source_id: resolved.proposalId,
      p_ip: ip ?? undefined,
      p_device_id_hash: deviceIdHash ?? undefined,
    },
  );

  if (mintError || !mintData) {
    // Mint failed — render anonymously, log the failure, don't block the user.
    // eslint-disable-next-line no-console
    console.error('[client-portal/mint-from-proposal] mint failed', {
      proposalId: resolved.proposalId,
      code: mintError?.code,
      message: mintError?.message,
    });
    return noMintFallback();
  }

  const row = Array.isArray(mintData) ? mintData[0] : mintData;
  if (!row || !row.token_raw || !row.expires_at || !row.token_id) {
    return noMintFallback();
  }

  const expiresAt = new Date(row.expires_at);
  const maxAgeSeconds = Math.min(
    CLIENT_PORTAL_MAX_COOKIE_AGE_SECONDS,
    Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
  );

  // 3. Fire-and-forget audit log for the mint event
  logAccess({
    sessionId: row.token_id,
    entityId: resolved.clientEntityId,
    workspaceId: resolved.workspaceId,
    resourceType: 'proposal',
    resourceId: resolved.proposalId,
    action: 'view',
    actorKind: 'anonymous_token',
    authMethod: 'magic_link',
    outcome: 'success',
    ip,
    userAgent: req.headers.get('user-agent'),
    metadata: { via: 'mint-from-proposal' },
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[client-portal/mint-from-proposal] audit log failed', err);
  });

  // 4. Set session cookie on response and redirect back to /p/<token>.
  // Also clear any stale no-mint marker from a prior lead-stage visit.
  const response = NextResponse.redirect(destination);
  response.cookies.set(CLIENT_PORTAL_SESSION_COOKIE, row.token_raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  });
  response.cookies.delete('unusonic_client_no_mint');

  return response;
}

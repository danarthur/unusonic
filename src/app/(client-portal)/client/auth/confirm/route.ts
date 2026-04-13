/**
 * PKCE-free magic link consumer for the client portal.
 *
 * GET /client/auth/confirm?token_hash=...&type=email&next=/client/home
 *
 * This route receives the token_hash from the magic-link email, verifies it
 * with Supabase's verifyOtp (NOT the standard PKCE flow), sets both the
 * Supabase auth session cookie AND our client portal session cookie, then
 * redirects to the target page.
 *
 * Why not PKCE: R1 found that @supabase/ssr uses PKCE by default, and the
 * code_verifier cookie lives in the browser that *requested* the link. If the
 * user clicks from a different browser/device, PKCE silently fails. The
 * token-hash path bypasses PKCE entirely.
 *
 * See: docs/reference/client-portal-magic-link-research.md (R1)
 * See: docs/audits/event-walkthrough-2026-04-11-fix-plan.md §1 Phase C.2
 *
 * @module app/(client-portal)/client/auth/confirm
 */
import 'server-only';

import { type NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { mintClientPortalSession } from '@/shared/lib/client-portal/mint-session';
import { logAccess } from '@/shared/lib/client-portal/audit';

function requestIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? null;
  return req.headers.get('x-real-ip');
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const type = req.nextUrl.searchParams.get('type');
  const next = req.nextUrl.searchParams.get('next') ?? '/client/home';
  const ip = requestIp(req);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (!tokenHash || type !== 'email') {
    return NextResponse.redirect(new URL('/client/sign-in?error=invalid_link', baseUrl));
  }

  try {
    // Verify the token via Supabase auth — this sets the Supabase session
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      type: 'email',
      token_hash: tokenHash,
    });

    if (error || !data.user) {
      Sentry.logger.warn('clientPortal.confirm.verifyOtpFailed', {
        error: error?.message,
        tokenHashPrefix: tokenHash.slice(0, 8),
      });
      return NextResponse.redirect(
        new URL('/client/sign-in?error=link_expired', baseUrl),
      );
    }

    // Find the entity claimed by this user
    const system = getSystemClient();
    const { data: entities } = await system
      .schema('directory')
      .from('entities')
      .select('id, owner_workspace_id')
      .eq('claimed_by_user_id', data.user.id)
      .limit(1);

    const entity = (entities as { id: string; owner_workspace_id: string }[] | null)?.[0];

    if (entity) {
      // Mint our client portal session cookie alongside the Supabase session
      await mintClientPortalSession({
        entityId: entity.id,
        sourceKind: 'magic_link',
        sourceId: data.user.id,
        ip,
      });

      // Fire-and-forget audit
      logAccess({
        entityId: entity.id,
        workspaceId: entity.owner_workspace_id,
        resourceType: 'sign_in',
        action: 'magic_link_issue',
        actorKind: 'claimed_user',
        actorId: data.user.id,
        authMethod: 'magic_link',
        outcome: 'success',
        ip,
        userAgent: req.headers.get('user-agent'),
      }).catch(() => {});
    }

    // Redirect to the target page
    return NextResponse.redirect(new URL(next, baseUrl));
  } catch (err) {
    Sentry.captureException(err);
    return NextResponse.redirect(
      new URL('/client/sign-in?error=link_expired', baseUrl),
    );
  }
}

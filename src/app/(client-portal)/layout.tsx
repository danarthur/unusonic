/**
 * Client portal route group layout.
 *
 * Route group: (client-portal)
 * URL prefix: /client/*
 *
 * Resolves the current portal context via getClientPortalContext(). This
 * layout intentionally does NOT write cookies (Server Component constraint
 * in Next.js 16) — rotation happens in the DB only, and mint happens via
 * the /api/client-portal/mint-from-proposal route handler on first touch.
 *
 * Auth gating:
 *   - kind='none' on any page except /client/sign-in → redirect to sign-in
 *   - kind='none' on /client/sign-in → render the sign-in form
 *   - kind='anonymous' or 'claimed' → pass through to the child page
 *
 * See client-portal-design.md §15.3, §16.1.
 */
import 'server-only';

import { redirect } from 'next/navigation';
import { headers as nextHeaders } from 'next/headers';

import {
  getClientPortalContext,
  rotateClientPortalSession,
} from '@/shared/lib/client-portal';

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await nextHeaders();
  const pathname = h.get('x-pathname') ?? h.get('x-invoke-path') ?? '';

  const context = await getClientPortalContext();

  // Rotate anonymous sessions in the background (DB only, no cookie writes).
  if (context.kind === 'anonymous') {
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      null;
    const ua = h.get('user-agent');
    // Fire-and-forget — don't block the render on rotation.
    rotateClientPortalSession({ ip, userAgent: ua }).catch(() => {});
  }

  const isSignInRoute =
    pathname.startsWith('/client/sign-in') || pathname === '/client/sign-in';

  if (context.kind === 'none' && !isSignInRoute) {
    redirect('/client/sign-in');
  }

  return (
    <div className="min-h-dvh bg-stage-canvas text-stage-text-primary">
      {children}
    </div>
  );
}

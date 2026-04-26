import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import * as Sentry from '@sentry/nextjs';

// ─── Route & role constants ───
// Mirrors src/shared/lib/resolve-destination.ts (inline for Edge Runtime safety)
const DASHBOARD_ROLES = ['owner', 'admin', 'member'];
const CLIENT_ROLES = ['client'];
const DASHBOARD_HOME = '/lobby';
const PORTAL_HOME = '/schedule';
const CLIENT_HOME = '/client/home';
const PORTAL_ROUTES = ['/schedule', '/my-calendar', '/profile', '/pay', '/pipeline', '/proposals', '/setlists', '/riders', '/crew-status'];

// External-service webhook routes. Each handler self-authenticates via
// signature verification (Stripe, Resend, DocuSeal) or HTTP Basic Auth
// (Postmark). The proxy must NOT gate these on user sessions — external
// services have no session cookie, so gating them here 307-redirects
// every webhook call to /login (root cause of the silent-webhook-failure
// incident on 2026-04-24; see docs/audits/).
//
// SECURITY CONTRACT: every path listed here MUST have a self-auth check
// as the first statement in its POST handler. Removing that check while
// the path is in WEBHOOK_ROUTES is a privilege-escalation bug. Audited
// 2026-04-24 — all five handlers return 401/400 on missing/bad auth.
//
// See src/__tests__/proxy.test.ts for the regression gate.
export const WEBHOOK_ROUTES = [
  '/api/webhooks/',        // postmark (Basic Auth), resend (x-resend-secret)
  '/api/stripe-webhooks/', // stripe signature verification (constructEvent)
  '/api/docuseal-webhook', // docuseal shared secret (x-docuseal-secret)
];

export const PUBLIC_ROUTES = [
  '/login', '/signup', '/forgot-password', '/auth/callback',
  '/p/', '/claim', '/confirm', '/crew/', '/bridge', '/dns-help/',
  '/api/auth/passkey/authenticate', '/api/auth/recover/request',
  ...WEBHOOK_ROUTES,
];
// Client portal has its own auth (session cookie or Supabase auth via claimed entity).
// See docs/reference/client-portal-design.md §14–§17. The proxy does NOT enforce
// anything on /client/* or /api/client-portal/* — the route group's layout and
// the API route handlers handle gating via getClientPortalContext() and the
// Route Handlers respectively.
const CLIENT_PORTAL_ROUTES = ['/client/', '/client', '/api/client-portal/'];

function isPortalRoute(pathname: string): boolean {
  return PORTAL_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
}

function isClientPortalRoute(pathname: string): boolean {
  return CLIENT_PORTAL_ROUTES.some(r => pathname === r || pathname.startsWith(r));
}

function isDashboardRole(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return DASHBOARD_ROLES.includes(slug);
}

function isClientRole(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return CLIENT_ROLES.includes(slug);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and Next.js internals (including file-based
  // icon/manifest routes like /icon, /apple-icon, /manifest.webmanifest which
  // are generated from src/app/icon.tsx etc. and have no file extension in
  // their URL — the extension test below wouldn't catch them).
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/monitoring') ||
    pathname.startsWith('/.well-known/') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon' ||
    pathname === '/apple-icon' ||
    pathname === '/manifest.webmanifest' ||
    pathname.startsWith('/icon/') ||
    pathname.startsWith('/apple-icon/') ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Client portal routes bypass the proxy's dashboard/employee auth entirely.
  // Their (client-portal)/layout.tsx resolves auth via getClientPortalContext()
  // (unusonic_client_session cookie OR Supabase auth for claimed entities) and
  // redirects to /client/sign-in when neither is present.
  if (isClientPortalRoute(pathname)) {
    return NextResponse.next();
  }

  // Proposal public token first-touch mint.
  // On first visit to /p/<token>, if neither the session cookie nor the
  // "no-mint-tried" marker cookie is present, redirect to the mint handler.
  // The mint handler sets one of those two cookies on its way back, breaking
  // any infinite loop on lead-stage proposals with no resolvable client entity.
  // This runs in Edge Runtime where NextResponse.redirect() produces a proper
  // HTTP 307 — server components can't do that in Next.js 16 (see §15.1).
  if (pathname.startsWith('/p/') && pathname.length > 3) {
    const hasSession = request.cookies.has('unusonic_client_session');
    const hasNoMintMarker = request.cookies.has('unusonic_client_no_mint');
    if (!hasSession && !hasNoMintMarker) {
      const proposalToken = pathname.slice(3).split('/')[0];
      if (proposalToken) {
        const mintUrl = new URL('/api/client-portal/mint-from-proposal', request.url);
        mintUrl.searchParams.set('token', proposalToken);
        return NextResponse.redirect(mintUrl);
      }
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (!PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
      Sentry.logger.warn('middleware.supabaseNotConfigured');
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  const response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // ─── Authenticate: JWT local decode → server refresh fallback ───
  let userId: string | null = null;
  let workspaceRoles: Record<string, string> = {};

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (!claimsError && claimsData?.claims?.sub) {
    userId = claimsData.claims.sub as string;
    const appMeta = (claimsData.claims as Record<string, unknown>)?.app_metadata;
    if (appMeta && typeof appMeta === 'object' && 'workspace_roles' in (appMeta as Record<string, unknown>)) {
      workspaceRoles = (appMeta as Record<string, unknown>).workspace_roles as Record<string, string>;
    }
  } else {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      if (user.app_metadata?.workspace_roles) {
        workspaceRoles = user.app_metadata.workspace_roles as Record<string, string>;
      }
    }
  }

  // `/` is public by exact match — startsWith('/') would match every path.
  const isPublic = pathname === '/' || PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  // ─── RULE 1: No user + protected route → login ───
  if (!userId && !isPublic) {
    Sentry.logger.info('middleware.noSession', { pathname });
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // ─── Resolve role (JWT first, DB fallback for legacy sessions) ───
  let roleSlug: string | null = null;
  let isPortalUser = false;
  let isClientUser = false;
  let hasWorkspace = Object.keys(workspaceRoles).length > 0;

  if (hasWorkspace) {
    const entries = Object.entries(workspaceRoles);
    const activeWsCookie = request.cookies.get('unusonic_active_workspace_id')?.value;

    if (activeWsCookie && workspaceRoles[activeWsCookie]) {
      roleSlug = workspaceRoles[activeWsCookie];
    } else {
      roleSlug = entries[0][1];
    }
    isClientUser = isClientRole(roleSlug);
    isPortalUser = !!roleSlug && !isDashboardRole(roleSlug) && !isClientUser;
  } else if (userId) {
    // Legacy sessions without sync trigger — temporary DB fallback
    const { data: memberRow } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (memberRow?.workspace_id) {
      hasWorkspace = true;
      const { data: slug } = await supabase.rpc('get_member_role_slug', {
        p_workspace_id: memberRow.workspace_id,
      });
      if (slug) {
        roleSlug = slug;
        isClientUser = isClientRole(slug);
        isPortalUser = !isDashboardRole(slug) && !isClientUser;
      }
    }
  }

  const resolvedHome = isClientUser ? CLIENT_HOME : isPortalUser ? PORTAL_HOME : DASHBOARD_HOME;

  // ─── RULE 2: Authenticated user on public route → redirect home ───
  // `/` is a passthrough so authed users can still see the marketing landing
  // page (Notion-style). They enter the app by clicking Sign in, which hits
  // /login and silently re-auths through this same rule.
  const isPassthrough = pathname === '/' || pathname === '/auth/callback' || pathname.startsWith('/p/') || pathname.startsWith('/claim') || pathname.startsWith('/confirm') || pathname.startsWith('/crew/') || pathname.startsWith('/bridge') || pathname.startsWith('/dns-help/');
  if (userId && isPublic && !isPassthrough) {
    if (!hasWorkspace) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    return NextResponse.redirect(new URL(resolvedHome, request.url));
  }

  // ─── RULE 4: Role-based route enforcement ───
  // Portal-only users cannot access dashboard routes.
  // Client-only users cannot access dashboard or portal routes (they use /client/*).
  // Dashboard users CAN access portal routes (progressive access — additive, never subtractive).
  // Note: /client/* routes bypass the proxy entirely (line 58), so client users
  // navigating to their portal never reach this check. This catches clients
  // trying to access dashboard or employee routes.
  if (userId && !isPublic && !pathname.startsWith('/api/') && !pathname.startsWith('/onboarding') && !pathname.startsWith('/signout')) {
    if (isClientUser && !isClientPortalRoute(pathname)) {
      Sentry.logger.info('middleware.clientUserOnDashboard', { pathname });
      return NextResponse.redirect(new URL(CLIENT_HOME, request.url));
    }
    if (isPortalUser && !isPortalRoute(pathname)) {
      Sentry.logger.info('middleware.portalUserOnDashboard', { pathname });
      return NextResponse.redirect(new URL(PORTAL_HOME, request.url));
    }
  }

  Sentry.logger.info('middleware.accessGranted', { pathname });
  return response;
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)'],
};

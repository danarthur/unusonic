import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import * as Sentry from '@sentry/nextjs';

// ─── Route & role constants ───
// Mirrors src/shared/lib/resolve-destination.ts (inline for Edge Runtime safety)
const DASHBOARD_ROLES = ['owner', 'admin', 'member'];
const DASHBOARD_HOME = '/lobby';
const PORTAL_HOME = '/schedule';
const PORTAL_ROUTES = ['/schedule', '/my-calendar', '/profile', '/pay', '/pipeline', '/proposals', '/setlists', '/riders', '/crew-status'];
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/auth/callback', '/p', '/claim', '/confirm', '/crew/'];

function isPortalRoute(pathname: string): boolean {
  return PORTAL_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
}

function isDashboardRole(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return DASHBOARD_ROLES.includes(slug);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/monitoring') ||
    pathname === '/favicon.ico' ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
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

  let response = NextResponse.next({ request: { headers: request.headers } });

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

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

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
  let hasWorkspace = Object.keys(workspaceRoles).length > 0;

  if (hasWorkspace) {
    const entries = Object.entries(workspaceRoles);
    const activeWsCookie = request.cookies.get('unusonic_active_workspace_id')?.value;

    if (activeWsCookie && workspaceRoles[activeWsCookie]) {
      roleSlug = workspaceRoles[activeWsCookie];
    } else {
      roleSlug = entries[0][1];
    }
    isPortalUser = !!roleSlug && !isDashboardRole(roleSlug);
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
        isPortalUser = !isDashboardRole(slug);
      }
    }
  }

  const resolvedHome = isPortalUser ? PORTAL_HOME : DASHBOARD_HOME;

  // ─── RULE 2: Authenticated user at root → onboarding or home ───
  if (userId && pathname === '/') {
    if (!hasWorkspace) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    return NextResponse.redirect(new URL(resolvedHome, request.url));
  }

  // ─── RULE 3: Authenticated user on public route → redirect home ───
  const isPassthrough = pathname === '/auth/callback' || pathname.startsWith('/p/') || pathname.startsWith('/claim') || pathname.startsWith('/confirm') || pathname.startsWith('/crew/');
  if (userId && isPublic && !isPassthrough) {
    if (!hasWorkspace) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    return NextResponse.redirect(new URL(resolvedHome, request.url));
  }

  // ─── RULE 4: Role-based route enforcement ───
  // Portal-only users cannot access dashboard routes.
  // Dashboard users CAN access portal routes (progressive access — additive, never subtractive).
  if (userId && !isPublic && !pathname.startsWith('/api/') && !pathname.startsWith('/onboarding') && !pathname.startsWith('/signout')) {
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

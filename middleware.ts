import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Public routes - no auth required (clients can view/sign proposals via link without an account)
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/auth/callback', '/p', '/claim', '/confirm', '/crew'];

// Portal routes — employee-only (route group is (portal), so no /portal prefix in URL)
const PORTAL_ROUTES = ['/schedule', '/calendar', '/profile', '/pay', '/pipeline', '/proposals', '/setlists', '/riders', '/crew-status'];

// Routes exempt from onboarding check
const ONBOARDING_EXEMPT = ['/onboarding', '/api/', '/schedule', '/calendar', '/profile', '/pay', '/pipeline', '/proposals', '/setlists', '/riders', '/crew-status', '/claim', '/confirm'];

// Routes exempt from SignalPay gating (Autonomous tier)
const SIGNALPAY_EXEMPT = ['/onboarding', '/api/', '/settings/connect-payouts', '/login', '/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    /\.(svg|png|jpg|jpeg|gif|webp|ico|css|js)$/.test(pathname)
  ) {
    return NextResponse.next();
  }
  
  // Check environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  // If Supabase not configured, redirect to login for protected routes
  if (!supabaseUrl || !supabaseKey) {
    const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
    if (!isPublic) {
      console.warn('[Middleware] Supabase not configured, redirecting to /login');
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }
  
  let response = NextResponse.next({
    request: { headers: request.headers },
  });
  
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });
  
  // Get user - this also refreshes the session
  const { data: { user } } = await supabase.auth.getUser();
  const isPublicRoute = PUBLIC_ROUTES.some(r => pathname.startsWith(r));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 1: No user + protected route → LOGIN
  // ═══════════════════════════════════════════════════════════════════════════
  if (!user && !isPublicRoute) {
    console.log(`[Middleware] No session, redirecting ${pathname} → /login`);
    const url = new URL('/login', request.url);
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }
  
  // ─── Onboarding status helper (cookie-cached, DB fallback) ───
  async function checkOnboardingCompleted(): Promise<boolean> {
    const cached = request.cookies.get('unusonic_onboarding')?.value;
    if (cached === '1') return true;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user!.id)
      .single();

    if (error || !profile || !profile.onboarding_completed) return false;

    // Cache for 1 hour to avoid DB hit on subsequent navigations
    response.cookies.set('unusonic_onboarding', '1', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60,
    });
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 2: User + public route (except callback and /p) → Check onboarding then home
  // ═══════════════════════════════════════════════════════════════════════════
  const isProposalLink = pathname.startsWith('/p/');
  const isClaimOrConfirm = pathname.startsWith('/claim') || pathname.startsWith('/confirm') || pathname.startsWith('/crew');
  if (user && isPublicRoute && pathname !== '/auth/callback' && !isProposalLink && !isClaimOrConfirm) {
    console.log(`[Middleware] User on public route ${pathname}, checking profile...`);

    const onboarded = await checkOnboardingCompleted();

    if (!onboarded) {
      console.log('[Middleware] Onboarding incomplete, → /onboarding');
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }

    // All good → dashboard
    console.log('[Middleware] Onboarding complete, → /');
    return NextResponse.redirect(new URL('/', request.url));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 3: User + protected route → Must have completed onboarding
  // ═══════════════════════════════════════════════════════════════════════════
  if (user && !isPublicRoute) {
    const isExempt = ONBOARDING_EXEMPT.some(r => pathname.startsWith(r));

    if (!isExempt) {
      console.log(`[Middleware] Checking onboarding for ${pathname}...`);

      const onboarded = await checkOnboardingCompleted();

      if (!onboarded) {
        console.log('[Middleware] Onboarding required, → /onboarding');
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }

      // RULE 3b: Role-based portal routing
      const isPortalRoute = PORTAL_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
      let roleSlug = request.cookies.get('unusonic_role_slug')?.value ?? null;

      if (!roleSlug) {
        // Resolve role slug via RPC — avoids PostgREST schema access issues in middleware context
        const { data: memberRow } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (memberRow?.workspace_id) {
          const { data: slug } = await supabase.rpc('get_member_role_slug', {
            p_workspace_id: memberRow.workspace_id,
          });
          roleSlug = slug ?? null;
        }

        // Cache in cookie for subsequent requests (expires on session end)
        if (roleSlug) {
          response.cookies.set('unusonic_role_slug', roleSlug, {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 60 * 60, // 1 hour — refresh on next middleware run after expiry
          });
        }
      }

      const isEmployee = roleSlug === 'employee';

      // Employee trying to access dashboard → redirect to portal
      if (isEmployee && !isPortalRoute && !pathname.startsWith('/api/') && !pathname.startsWith('/signout') && !pathname.startsWith('/settings')) {
        return NextResponse.redirect(new URL('/schedule', request.url));
      }

      // Non-employee trying to access portal → redirect to dashboard
      if (!isEmployee && isPortalRoute) {
        return NextResponse.redirect(new URL('/lobby', request.url));
      }

      // RULE 4: Autonomous tier + !signalpay_enabled → force connect payouts
      // Reads from workspaces (canonical source) via workspace_members
      const isSignalPayExempt = SIGNALPAY_EXEMPT.some(r => pathname.startsWith(r));
      if (!isSignalPayExempt) {
        const { data: rows } = await supabase
          .from('workspace_members')
          .select('workspaces(subscription_tier, signalpay_enabled)')
          .eq('user_id', user.id);

        const needsSignalPay = rows?.some((r) => {
          const ws = r.workspaces as { subscription_tier?: string; signalpay_enabled?: boolean } | null;
          return ws?.subscription_tier === 'autonomous' && !ws?.signalpay_enabled;
        });

        if (needsSignalPay) {
          console.log('[Middleware] Autonomous tier requires SignalPay → /settings/connect-payouts');
          return NextResponse.redirect(new URL('/settings/connect-payouts', request.url));
        }
      }
      
      console.log('[Middleware] Access granted to', pathname);
    }
  }
  
  return response;
}

export const config = {
  // Run on all routes except _next, static assets, and favicon
  matcher: ['/((?!_next|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)'],
};

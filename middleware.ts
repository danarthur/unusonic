import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// Public routes - no auth required (clients can view/sign proposals via link without an account)
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/auth/callback', '/p', '/claim', '/confirm', '/crew'];

// Portal routes — employee-only (route group is (portal), so no /portal prefix in URL)
const PORTAL_ROUTES = ['/schedule', '/calendar', '/profile', '/pay', '/pipeline', '/proposals'];

// Routes exempt from onboarding check
const ONBOARDING_EXEMPT = ['/onboarding', '/api/', '/schedule', '/calendar', '/profile', '/pay', '/pipeline', '/proposals', '/claim', '/confirm'];

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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 2: User + public route (except callback and /p) → Check onboarding then home
  // ═══════════════════════════════════════════════════════════════════════════
  const isProposalLink = pathname.startsWith('/p/');
  const isClaimOrConfirm = pathname.startsWith('/claim') || pathname.startsWith('/confirm') || pathname.startsWith('/crew');
  if (user && isPublicRoute && pathname !== '/auth/callback' && !isProposalLink && !isClaimOrConfirm) {
    console.log(`[Middleware] User on public route ${pathname}, checking profile...`);
    
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('id', user.id)
      .single();
    
    // Profile doesn't exist or error → needs onboarding
    if (error || !profile) {
      console.log('[Middleware] No profile found, → /onboarding');
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    
    // Onboarding not complete → onboarding
    if (!profile.onboarding_completed) {
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
      
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('id', user.id)
        .single();
      
      // No profile or error → needs onboarding (FAIL CLOSED)
      if (error || !profile) {
        console.log('[Middleware] Profile check failed, → /onboarding');
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }
      
      // Onboarding not complete
      if (!profile.onboarding_completed) {
        console.log('[Middleware] Onboarding required, → /onboarding');
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }

      // RULE 3b: Role-based portal routing
      const isPortalRoute = PORTAL_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'));
      let roleSlug = request.cookies.get('unusonic_role_slug')?.value ?? null;

      if (!roleSlug) {
        // Resolve role slug from workspace_members + ops.workspace_roles
        const { data: memberRow } = await supabase
          .from('workspace_members')
          .select('role, role_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();

        if (memberRow?.role_id) {
          const { data: roleRow } = await supabase
            .schema('ops')
            .from('workspace_roles')
            .select('slug')
            .eq('id', memberRow.role_id)
            .maybeSingle();
          roleSlug = roleRow?.slug ?? memberRow.role ?? null;
        } else {
          roleSlug = memberRow?.role ?? null;
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
      const isSignalPayExempt = SIGNALPAY_EXEMPT.some(r => pathname.startsWith(r));
      if (!isSignalPayExempt) {
        const { data: rows } = await supabase
          .from('organization_members')
          .select('commercial_organizations(subscription_tier, signalpay_enabled)')
          .eq('user_id', user.id);

        const needsSignalPay = rows?.some((r) => {
          const co = r.commercial_organizations as { subscription_tier?: string; signalpay_enabled?: boolean } | null;
          return co?.subscription_tier === 'autonomous' && !co?.signalpay_enabled;
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

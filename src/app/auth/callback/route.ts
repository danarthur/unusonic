/**
 * Supabase Auth Callback
 * Exchanges OAuth/magic-link code for a session and redirects.
 * @module app/auth/callback
 */

import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  // Default lands in the dashboard home; middleware Rule 4 re-routes portal
  // users to /schedule and clients to /client/home from there. Prior behavior
  // sent users to / and relied on a middleware redirect that was removed when
  // the landing page started rendering at /.
  const next = searchParams.get('next') ?? '/lobby';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Auth Callback] Supabase not configured');
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  const origin = request.nextUrl.origin;
  const redirectTo = next.startsWith('/') ? `${origin}${next}` : `${origin}/`;
  const response = NextResponse.redirect(redirectTo);

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[Auth Callback] exchangeCodeForSession failed:', error.message);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', error.message);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

/**
 * Spotify OAuth callback — exchanges code for tokens, stores on person entity.
 * GET /api/auth/spotify/callback?code=...&state=...
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { decryptState } from '@/features/auth/spotify-connect/actions';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PROFILE_URL = 'https://api.spotify.com/v1/me';
const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const stateParam = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  // Helper: build redirect or popup-close response
  function redirectTo(returnTo: string | undefined, result: string, popup?: boolean) {
    if (popup) {
      // Popup mode: render a page that signals the opener via localStorage and closes
      return new NextResponse(
        `<!DOCTYPE html><html><head><title>Spotify</title></head><body><script>
          try { localStorage.setItem('spotify_callback', '${result}'); } catch(e) {}
          window.close();
        </script><p style="font-family:system-ui;color:#888;text-align:center;margin-top:40vh">
          Spotify ${result === 'connected' ? 'connected' : 'failed'}. You can close this tab.
        </p></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    const base = (returnTo as string) || '/profile';
    const url = new URL(base, req.url);
    url.searchParams.set('spotify', result);
    return NextResponse.redirect(url);
  }

  // User denied access
  if (error) {
    return redirectTo(undefined, 'denied');
  }

  if (!code || !stateParam) {
    return redirectTo(undefined, 'error');
  }

  // Validate state (CSRF)
  const state = await decryptState(stateParam);
  if (!state || !state.userId || !state.timestamp) {
    return redirectTo(undefined, 'error');
  }
  const isPopup = !!state.popup;

  if (Date.now() - (state.timestamp as number) > STATE_MAX_AGE_MS) {
    return redirectTo(state.returnTo as string | undefined, 'expired', isPopup);
  }

  // Verify authenticated user matches state
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) {
    return redirectTo(state.returnTo as string | undefined, 'error', isPopup);
  }

  // Exchange code for tokens
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  if (!clientId || !clientSecret) {
    return redirectTo(state.returnTo as string | undefined, 'error', isPopup);
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${siteUrl}/api/auth/spotify/callback`,
    }),
  });

  if (!tokenRes.ok) {
    console.error('[Spotify OAuth] Token exchange failed:', tokenRes.status);
    return redirectTo(state.returnTo as string | undefined, 'error', isPopup);
  }

  const tokens = await tokenRes.json();
  const accessToken = tokens.access_token as string;
  const refreshToken = tokens.refresh_token as string;

  // Fetch user profile
  const profileRes = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  let spotifyUserId = '';
  let spotifyDisplayName = '';
  if (profileRes.ok) {
    const profile = await profileRes.json();
    spotifyUserId = profile.id ?? '';
    spotifyDisplayName = profile.display_name ?? profile.id ?? '';
  }

  // Resolve person entity
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) {
    return redirectTo(state.returnTo as string | undefined, 'error', isPopup);
  }

  // Store tokens on entity attributes
  await supabase.rpc('patch_entity_attributes', {
    p_entity_id: person.id,
    p_attributes: {
      spotify_refresh_token: refreshToken,
      spotify_user_id: spotifyUserId,
      spotify_display_name: spotifyDisplayName,
    },
  });

  return redirectTo(state.returnTo as string | undefined, 'connected', isPopup);
}

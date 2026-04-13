/**
 * Spotify per-user token management — reads refresh token from person entity,
 * exchanges for fresh access token, makes API calls on behalf of the user.
 * @module shared/api/spotify/user-client
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

// In-memory cache: personEntityId → { token, expiresAt }
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number } | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    console.error('[Spotify] Token refresh failed:', res.status);
    return null;
  }

  const data = await res.json();
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

/**
 * Get a valid Spotify access token for a specific person entity.
 * Returns null if the user hasn't connected Spotify.
 */
async function getUserToken(personEntityId: string): Promise<string | null> {
  // Check cache first
  const cached = tokenCache.get(personEntityId);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }

  // Read refresh token from entity attributes
  const supabase = await createClient();
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('attributes')
    .eq('id', personEntityId)
    .maybeSingle();

  if (!entity) { console.error('[Spotify] Entity not found:', personEntityId); return null; }

  const attrs = readEntityAttrs(entity.attributes, 'person');
  const refreshToken = attrs.spotify_refresh_token;
  if (!refreshToken) { console.error('[Spotify] No refresh token for entity:', personEntityId); return null; }

  const result = await refreshAccessToken(refreshToken);
  if (!result) return null;

  tokenCache.set(personEntityId, {
    token: result.accessToken,
    expiresAt: Date.now() + result.expiresIn * 1000,
  });

  return result.accessToken;
}

/**
 * Fetch from Spotify Web API using a specific user's token.
 * Returns null if the user hasn't connected Spotify or the request fails.
 */
export async function spotifyUserFetch<T = unknown>(
  personEntityId: string,
  path: string,
  params?: Record<string, string>,
): Promise<T | null> {
  const token = await getUserToken(personEntityId);
  if (!token) return null;

  const url = new URL(`${API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    if (res.status === 401) {
      // Token revoked — clear cache
      tokenCache.delete(personEntityId);
    }
    return null;
  }

  return res.json();
}

/**
 * POST to Spotify Web API using a specific user's token.
 * Returns data + status code (status needed to distinguish 403 scope errors).
 */
export async function spotifyUserPost<T = unknown>(
  personEntityId: string,
  path: string,
  body: unknown,
): Promise<{ data: T; status: number } | { data: null; status: number }> {
  const token = await getUserToken(personEntityId);
  if (!token) return { data: null, status: 401 };

  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) tokenCache.delete(personEntityId);
    return { data: null, status: res.status };
  }

  const data = await res.json() as T;
  return { data, status: res.status };
}

/**
 * Spotify Client Credentials — server-only singleton.
 * Manages token lifecycle (auto-refresh on expiry).
 * Returns null helpers when SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are not set.
 * @module shared/api/spotify/client
 */

import 'server-only';

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function getCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function getToken(): Promise<string | null> {
  const creds = getCredentials();
  if (!creds) return null;

  // Return cached token if still valid (with 60s buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    console.error('[Spotify] Token fetch failed:', res.status, await res.text());
    return null;
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

/**
 * Fetch from Spotify Web API with automatic token management.
 * Returns null if Spotify is not configured or the request fails.
 */
export async function spotifyFetch<T = unknown>(
  path: string,
  params?: Record<string, string>,
): Promise<T | null> {
  const token = await getToken();
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
      // Token expired mid-request — clear cache and retry once
      cachedToken = null;
      tokenExpiresAt = 0;
      const retryToken = await getToken();
      if (!retryToken) return null;
      const retry = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${retryToken}` },
      });
      if (!retry.ok) return null;
      return retry.json();
    }
    return null;
  }

  return res.json();
}

/** Returns true if Spotify credentials are configured. */
export function isSpotifyConfigured(): boolean {
  return !!getCredentials();
}

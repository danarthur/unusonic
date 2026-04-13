/**
 * Apple Music API — server-only developer token management.
 * Signs a JWT with ES256 using the MusicKit private key.
 * Returns null helpers when APPLE_MUSIC_* env vars are not set.
 * @module shared/api/apple-music/client
 */

import 'server-only';
import { SignJWT, importPKCS8 } from 'jose';

const API_BASE = 'https://api.music.apple.com/v1';
const DEFAULT_STOREFRONT = 'us';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

function getConfig() {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKeyBase64 = process.env.APPLE_MUSIC_PRIVATE_KEY;
  if (!teamId || !keyId || !privateKeyBase64) return null;
  return { teamId, keyId, privateKeyBase64 };
}

async function getDeveloperToken(): Promise<string | null> {
  const config = getConfig();
  if (!config) return null;

  // Return cached token if still valid (with 1 hour buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 3_600_000) {
    return cachedToken;
  }

  try {
    const privateKeyPem = Buffer.from(config.privateKeyBase64, 'base64').toString('utf-8');
    const key = await importPKCS8(privateKeyPem, 'ES256');

    const now = Math.floor(Date.now() / 1000);
    const exp = now + 15_777_000; // ~6 months (max allowed by Apple)

    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: config.keyId })
      .setIssuer(config.teamId)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(key);

    cachedToken = token;
    tokenExpiresAt = exp * 1000;
    return cachedToken;
  } catch (err) {
    console.error('[AppleMusic] Token generation failed:', err);
    return null;
  }
}

/**
 * Fetch from Apple Music API with automatic developer token management.
 * Returns null if Apple Music is not configured or the request fails.
 */
export async function appleMusicFetch<T = unknown>(
  path: string,
  params?: Record<string, string>,
): Promise<T | null> {
  const token = await getDeveloperToken();
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
      // Token invalid — clear cache (will regenerate on next call)
      cachedToken = null;
      tokenExpiresAt = 0;
    }
    return null;
  }

  return res.json();
}

/** Returns true if Apple Music credentials are configured. */
export function isAppleMusicConfigured(): boolean {
  return !!getConfig();
}

/** Default storefront for catalog requests. */
export { DEFAULT_STOREFRONT };

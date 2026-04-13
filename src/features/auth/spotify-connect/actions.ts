'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_SCOPES = 'playlist-read-private playlist-read-collaborative user-library-read playlist-modify-private';

/* ── State encryption (CSRF protection) ─────────────────────────── */

function getEncryptionKey(): Buffer {
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!secret) throw new Error('SPOTIFY_CLIENT_SECRET not set');
  return scryptSync(secret, 'spotify-oauth-state', 32);
}

function encryptState(data: Record<string, unknown>): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

export async function decryptState(token: string): Promise<Record<string, unknown> | null> {
  try {
    const key = getEncryptionKey();
    const buf = Buffer.from(token, 'base64url');
    const iv = buf.subarray(0, 16);
    const tag = buf.subarray(16, 32);
    const data = buf.subarray(32);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

/* ── Actions ────────────────────────────────────────────────────── */

export async function getSpotifyAuthUrl(returnTo?: string, popup?: boolean): Promise<{ url: string } | { error: string }> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  if (!clientId) return { error: 'Spotify not configured' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  const state = encryptState({
    userId: user.id,
    timestamp: Date.now(),
    returnTo: returnTo ?? '/profile',
    popup: popup ?? false,
  });

  const redirectUri = `${siteUrl}/api/auth/spotify/callback`;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: SPOTIFY_SCOPES,
    redirect_uri: redirectUri,
    state,
    show_dialog: 'true',
  });

  return { url: `${SPOTIFY_AUTH_URL}?${params.toString()}` };
}

export async function disconnectSpotify(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { ok: false, error: 'No profile' };

  const { error } = await supabase.rpc('patch_entity_attributes', {
    p_entity_id: person.id,
    p_attributes: {
      spotify_refresh_token: null,
      spotify_user_id: null,
      spotify_display_name: null,
    },
  });

  if (error) return { ok: false, error: 'Failed to disconnect Spotify' };
  return { ok: true };
}

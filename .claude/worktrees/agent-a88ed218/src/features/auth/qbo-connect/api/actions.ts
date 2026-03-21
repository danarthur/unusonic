'use server';

/**
 * QBO OAuth server actions.
 * State encrypts workspace_id for CSRF safety and tenant binding.
 */

import { createClient } from '@/shared/api/supabase/server';
import { saveQboTokens } from '@/shared/api/quickbooks/server-env';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

const QB_OAUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const QB_SCOPES = 'com.intuit.quickbooks.accounting';
const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function getStateKey(): Buffer {
  const raw = process.env.QBO_TOKEN_ENCRYPTION_KEY ?? process.env.QBO_STATE_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error('QBO_TOKEN_ENCRYPTION_KEY or QBO_STATE_ENCRYPTION_KEY must be set');
  }
  const salt = process.env.QBO_STATE_SALT || 'signal-qbo-state-salt';
  return scryptSync(raw, salt, KEY_LEN);
}

function encryptState(workspaceId: string): string {
  const key = getStateKey();
  const iv = randomBytes(IV_LEN);
  const payload = JSON.stringify({ workspace_id: workspaceId, ts: Date.now() });
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = (cipher as unknown as { getAuthTag(): Buffer }).getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

function decryptState(state: string): string {
  const key = getStateKey();
  const buf = Buffer.from(state, 'base64url');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('Invalid state');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const payload = decipher.update(enc) + decipher.final('utf8');
  const data = JSON.parse(payload) as { workspace_id: string; ts: number };
  const maxAge = 10 * 60 * 1000;
  if (Date.now() - data.ts > maxAge) throw new Error('State expired');
  return data.workspace_id;
}

function getRedirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${base}/api/qbo/callback`;
}

export type InitiateResult = { success: true; authUrl: string } | { success: false; error: string };

/**
 * Build Intuit OAuth URL with state = encrypted workspace_id (CSRF + tenant binding).
 */
export async function initiateConnection(workspaceId: string): Promise<InitiateResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in to connect QuickBooks' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return { success: false, error: 'You must be a workspace admin to connect QuickBooks' };
  }

  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  if (!clientId) {
    return { success: false, error: 'QuickBooks app is not configured' };
  }

  try {
    const state = encryptState(workspaceId);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: QB_SCOPES,
      redirect_uri: getRedirectUri(),
      state,
    });
    const authUrl = `${QB_OAUTH_URL}?${params.toString()}`;
    return { success: true, authUrl };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Failed to initiate connection' };
  }
}

export type ExchangeResult = { success: true } | { success: false; error: string };

/**
 * Validate state (decrypt workspace_id), exchange code for tokens, persist via saveQboTokens.
 */
export async function exchangeCode(
  code: string,
  realmId: string,
  state: string
): Promise<ExchangeResult> {
  let workspaceId: string;
  try {
    workspaceId = decryptState(state);
  } catch {
    return { success: false, error: 'Invalid or expired state. Please try connecting again.' };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return { success: false, error: 'You do not have access to this workspace' };
  }

  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { success: false, error: 'QuickBooks app is not configured' };
  }

  const tokenRes = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    return { success: false, error: 'Failed to exchange code for tokens' };
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const token_expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  try {
    await saveQboTokens(workspaceId, {
      realm_id: realmId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at,
    });
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to save connection',
    };
  }

  return { success: true };
}

export type DisconnectResult = { success: true } | { success: false; error: string };

/**
 * Disconnect QBO for a workspace (delete qbo_configs row).
 */
export async function disconnectQbo(workspaceId: string): Promise<DisconnectResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You must be logged in' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return { success: false, error: 'You do not have access to this workspace' };
  }

  const { error } = await supabase
    .from('qbo_configs')
    .delete()
    .eq('workspace_id', workspaceId);

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}

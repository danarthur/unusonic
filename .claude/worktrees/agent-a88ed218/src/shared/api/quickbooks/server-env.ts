'use server';

/**
 * QBO token manager – server-only.
 * Reads/writes qbo_configs with app-level encryption (no vault extension).
 * When vault is available, switch to vault.decrypted_secrets for reads and
 * vault.create_secret + qbo_configs vault_id columns for writes.
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import type { QboConfig } from './types';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT_LEN = 16;
const KEY_LEN = 32;

function getKey(): Buffer {
  const raw = process.env.QBO_TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'QBO_TOKEN_ENCRYPTION_KEY must be set (min 16 chars) for token encryption'
    );
  }
  const salt = process.env.QBO_TOKEN_ENCRYPTION_SALT || 'signal-qbo-default-salt';
  return scryptSync(raw, salt, KEY_LEN);
}

function encrypt(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
  ]);
  const tag = (cipher as unknown as { getAuthTag(): Buffer }).getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, 'base64url');
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('Invalid encrypted token');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(enc) + decipher.final('utf8');
}

/**
 * Resolve QBO config for a workspace. Decrypts tokens from qbo_configs.
 * Uses session-scoped client (RLS); user must be in workspace.
 */
export async function getQboConfig(workspaceId: string): Promise<QboConfig | null> {
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from('qbo_configs')
    .select('realm_id, access_token, refresh_token, token_expires_at')
    .eq('workspace_id', workspaceId)
    .single();

  if (error || !row) return null;

  try {
    return {
      realm_id: row.realm_id,
      access_token: decrypt(row.access_token),
      refresh_token: decrypt(row.refresh_token),
      token_expires_at:
        typeof row.token_expires_at === 'string'
          ? row.token_expires_at
          : new Date(row.token_expires_at).toISOString(),
    };
  } catch {
    return null;
  }
}

export interface SaveQboTokensInput {
  realm_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

/**
 * Persist QBO tokens for a workspace. Encrypts and upserts in one step (transaction-safe).
 * Uses session-scoped client; user must be in workspace (RLS).
 */
export async function saveQboTokens(
  workspaceId: string,
  tokens: SaveQboTokensInput
): Promise<void> {
  const supabase = await createClient();
  const access_enc = encrypt(tokens.access_token);
  const refresh_enc = encrypt(tokens.refresh_token);

  const { error } = await supabase.from('qbo_configs').upsert(
    {
      workspace_id: workspaceId,
      realm_id: tokens.realm_id,
      access_token: access_enc,
      refresh_token: refresh_enc,
      token_expires_at: tokens.token_expires_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'workspace_id' }
  );

  if (error) throw new Error(`Failed to save QBO tokens: ${error.message}`);
}

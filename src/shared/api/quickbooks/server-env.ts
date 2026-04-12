/**
 * QBO token manager — server-only.
 *
 * Reads/writes tokens via Supabase Vault (supabase_vault extension) and
 * the finance.qbo_connections table. Replaces the old qbo_configs +
 * app-level crypto approach with Vault-managed encryption.
 *
 * Key design:
 * - Token secrets are stored via vault.create_secret() / vault.update_secret()
 * - Only the secret UUIDs live in finance.qbo_connections
 * - Reads go through vault.decrypted_secrets (SECURITY DEFINER view)
 * - All operations use the system client (service_role) — these are
 *   server-only calls from webhook handlers and QBO sync workers
 *
 * @module shared/api/quickbooks/server-env
 */

'use server';

import 'server-only';
import { getSystemClient } from '@/shared/api/supabase/system';
import type { QboConfig } from './types';

/**
 * Resolve QBO config for a workspace. Reads tokens from Vault via
 * the SECURITY DEFINER function finance.get_fresh_qbo_token.
 */
export async function getQboConfig(workspaceId: string): Promise<QboConfig | null> {
  const system = getSystemClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { data: conn, error } = await (system as any)
    .schema('finance')
    .from('qbo_connections')
    .select('realm_id, access_token_secret_id, access_token_expires_at, status')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle();

  if (error || !conn) return null;

  // Read the access token from Vault
  const { data: secretRow } = await (system as any)
    .schema('vault')
    .from('decrypted_secrets')
    .select('decrypted_secret')
    .eq('id', conn.access_token_secret_id)
    .maybeSingle();

  if (!secretRow?.decrypted_secret) return null;

  return {
    realm_id: conn.realm_id,
    access_token: secretRow.decrypted_secret,
    refresh_token: '', // Not exposed via this path; use get_fresh_qbo_token RPC for full refresh
    token_expires_at: conn.access_token_expires_at,
  };
}

export interface SaveQboTokensInput {
  realm_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string;
}

/**
 * Persist QBO tokens for a workspace. Creates Vault secrets and writes
 * the secret UUIDs to finance.qbo_connections.
 *
 * For initial connection (no existing row): creates new Vault secrets + inserts.
 * For token refresh (existing row): updates Vault secrets + updates row.
 */
export async function saveQboTokens(
  workspaceId: string,
  tokens: SaveQboTokensInput,
  connectedByUserId?: string | null,
): Promise<void> {
  const system = getSystemClient();

  // Check if connection already exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (system as any)
    .schema('finance')
    .from('qbo_connections')
    .select('id, access_token_secret_id, refresh_token_secret_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (existing) {
    // Update existing secrets via Vault
    await system.rpc('vault.update_secret' as any, {
      secret_id: existing.access_token_secret_id,
      new_secret: tokens.access_token,
    });
    await system.rpc('vault.update_secret' as any, {
      secret_id: existing.refresh_token_secret_id,
      new_secret: tokens.refresh_token,
    });

    // Update connection row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (system as any)
      .schema('finance')
      .from('qbo_connections')
      .update({
        realm_id: tokens.realm_id,
        access_token_expires_at: tokens.token_expires_at,
        refresh_token_expires_at: new Date(Date.now() + 100 * 86400 * 1000).toISOString(), // 100 days
        last_refreshed_at: new Date().toISOString(),
        status: 'active',
        last_sync_error: null,
      })
      .eq('workspace_id', workspaceId);
  } else {
    // Create new Vault secrets
    const { data: accessSecret } = await system.rpc('vault.create_secret' as any, {
      new_secret: tokens.access_token,
      new_name: `qbo_access_${workspaceId}`,
    });

    const { data: refreshSecret } = await system.rpc('vault.create_secret' as any, {
      new_secret: tokens.refresh_token,
      new_name: `qbo_refresh_${workspaceId}`,
    });

    if (!accessSecret || !refreshSecret) {
      throw new Error('Failed to create Vault secrets for QBO tokens');
    }

    // Insert connection row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (system as any)
      .schema('finance')
      .from('qbo_connections')
      .insert({
        workspace_id: workspaceId,
        realm_id: tokens.realm_id,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
        status: 'active',
        access_token_secret_id: accessSecret,
        refresh_token_secret_id: refreshSecret,
        access_token_expires_at: tokens.token_expires_at,
        refresh_token_expires_at: new Date(Date.now() + 100 * 86400 * 1000).toISOString(),
        connected_by_user_id: connectedByUserId ?? null,
        default_item_ids: {},
      });

    if (error) {
      throw new Error(`Failed to save QBO connection: ${error.message}`);
    }
  }
}

/**
 * Disconnect QBO for a workspace. Deletes Vault secrets and the connection row.
 */
export async function disconnectQbo(workspaceId: string): Promise<void> {
  const system = getSystemClient();

  // Read secret IDs before deleting
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conn } = await (system as any)
    .schema('finance')
    .from('qbo_connections')
    .select('access_token_secret_id, refresh_token_secret_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!conn) return;

  // Delete Vault secrets (best-effort)
  try {
    if (conn.access_token_secret_id) {
      await system.rpc('vault.update_secret' as any, {
        secret_id: conn.access_token_secret_id,
        new_secret: 'REVOKED',
      });
    }
    if (conn.refresh_token_secret_id) {
      await system.rpc('vault.update_secret' as any, {
        secret_id: conn.refresh_token_secret_id,
        new_secret: 'REVOKED',
      });
    }
  } catch {
    // Vault cleanup failure is non-fatal; the tokens are now unusable
  }

  // Delete the connection row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (system as any)
    .schema('finance')
    .from('qbo_connections')
    .delete()
    .eq('workspace_id', workspaceId);
}

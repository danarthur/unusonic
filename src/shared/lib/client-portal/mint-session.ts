/**
 * Mint a new client portal session.
 *
 * Called from first-touch surfaces (today: /p/[token] proposal view).
 * Creates a row in client_portal_tokens via the client_mint_session_token RPC,
 * sets the httpOnly session cookie with the raw token, and returns the
 * session metadata for the caller to use in audit logging.
 *
 * The raw token is returned by the RPC exactly once and never stored
 * anywhere else — we set the cookie in the same request.
 *
 * @module shared/lib/client-portal/mint-session
 */
import 'server-only';

import { headers as nextHeaders } from 'next/headers';

import { getSystemClient } from '@/shared/api/supabase/system';

import { setSessionCookie } from './cookies';
import { computeDeviceIdHash } from './device';

export type MintSessionInput = {
  entityId: string;
  sourceKind: 'proposal' | 'invoice' | 'event' | 'magic_link';
  sourceId: string;
  /** Extracted from request for the created_ip column. */
  ip: string | null;
};

export type MintSessionResult = {
  sessionId: string;
  expiresAt: Date;
};

/**
 * Create a new client portal session and set the cookie.
 *
 * Throws on DB error. Callers wrap this in try/catch if they want to fall
 * back to a non-authenticated anonymous view (usually you don't — if mint
 * fails, the whole request is broken).
 */
export async function mintClientPortalSession(
  input: MintSessionInput,
): Promise<MintSessionResult> {
  const supabase = getSystemClient();
  const h = await nextHeaders();
  const deviceIdHash = computeDeviceIdHash(h);

  const { data, error } = await supabase.rpc('client_mint_session_token', {
    p_entity_id: input.entityId,
    p_source_kind: input.sourceKind,
    p_source_id: input.sourceId,
    p_ip: input.ip ?? undefined,
    p_device_id_hash: deviceIdHash ?? undefined,
  });

  if (error) {
    throw new Error(`client_mint_session_token failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.token_raw || !row.token_id || !row.expires_at) {
    throw new Error('client_mint_session_token returned empty result');
  }

  const expiresAt = new Date(row.expires_at);
  await setSessionCookie(row.token_raw, expiresAt);

  return {
    sessionId: row.token_id,
    expiresAt,
  };
}

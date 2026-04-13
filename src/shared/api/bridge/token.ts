/**
 * Bridge device token utilities — server-only.
 *
 * Tokens are opaque random strings (`unb_live_` + 32 bytes base64url), stored
 * as SHA-256 hashes in `public.bridge_device_tokens.token_hash`. Verification
 * is a DB lookup by hash; there is no JWT. This matches the GitHub PAT /
 * Stripe restricted key / Slack bot token pattern.
 *
 * @module shared/api/bridge/token
 */

import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { getSystemClient } from '@/shared/api/supabase/system';

const TOKEN_PREFIX = 'unb_live_';
const TOKEN_BYTES = 32;

export type BridgeTokenClaims = {
  userId: string;
  personEntityId: string;
  deviceTokenId: string;
};

/** Generate a new opaque Bridge device token. ~192 bits of entropy. */
export function generateBridgeToken(): string {
  return TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
}

/** SHA-256 hex of a token, used for storage and lookup. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Extract the raw Bearer token from a request. */
export function extractRawToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

/**
 * Verify a Bridge device token by hashing it and looking it up in the DB.
 * Returns the token's claims if valid and not revoked, else null.
 */
export async function verifyBridgeTokenFromRequest(
  request: Request,
): Promise<BridgeTokenClaims | null> {
  const raw = extractRawToken(request);
  if (!raw || !raw.startsWith(TOKEN_PREFIX)) return null;

  const system = getSystemClient();
  const tokenHash = hashToken(raw);

  const { data } = await system
    .from('bridge_device_tokens')
    .select('id, user_id, person_entity_id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (!data || data.revoked_at) return null;

  return {
    userId: data.user_id,
    personEntityId: data.person_entity_id,
    deviceTokenId: data.id,
  };
}

/**
 * Normalize a pairing code typed by a human.
 * Strips separators, uppercases, applies Crockford-style confusable remapping
 * (I, L → 1; O → 0), and validates against the 8-char Crockford base32
 * alphabet. Returns the canonical code or null if invalid.
 */
export function normalizeBridgePairingCode(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[-_\s]/g, '')
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');

  // Crockford base32 alphabet: 0-9 A-H J K M N P Q R S T V W X Y Z
  if (!/^[0-9A-HJKMNP-TV-Z]{8}$/.test(cleaned)) return null;
  return cleaned;
}

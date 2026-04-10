/**
 * Device fingerprint hashing for client portal sessions.
 *
 * Computes a SHA-256 hash of (user_agent + accept_language). Stored on
 * client_portal_tokens.device_id_hash and compared on each rotate call.
 * Major drift is logged as outcome='session_device_drift' in the audit log
 * but does NOT auto-revoke by default (invariant §17.12.3).
 *
 * @module shared/lib/client-portal/device
 */
import 'server-only';

import { createHash } from 'node:crypto';

/**
 * Derive a stable-ish device fingerprint from request headers.
 * Returns null if both headers are missing (pre-JS SSR with no UA).
 */
export function computeDeviceIdHash(headers: Headers): string | null {
  const ua = headers.get('user-agent') ?? '';
  const lang = headers.get('accept-language') ?? '';
  if (!ua && !lang) return null;

  return createHash('sha256').update(`${ua}||${lang}`).digest('hex');
}

/**
 * Compare two device hashes for drift detection.
 * Returns 'match' | 'drift' | 'unknown' (when either side is null).
 */
export function compareDeviceHashes(
  stored: string | null,
  current: string | null,
): 'match' | 'drift' | 'unknown' {
  if (!stored || !current) return 'unknown';
  return stored === current ? 'match' : 'drift';
}

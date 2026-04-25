/**
 * Basic Auth verification for Postmark inbound webhook.
 *
 * Hardened against length-based timing side-channels: `timingSafeEqual`
 * throws on buffer length mismatch, which leaks the expected length via
 * response time. Pad both inputs to a constant 64 bytes before compare,
 * then check length separately in constant time.
 *
 * Fail-closed if either env var is missing or empty — we never run in
 * open-access mode, not even in dev. Misconfiguration must be visible.
 *
 * @module app/api/webhooks/postmark/__lib__/auth
 */

import { timingSafeEqual } from 'crypto';

/** Pad-target length. 64 bytes is larger than any reasonable username
 *  or password (generated ones are 40 chars), so real credentials fit
 *  and attacker-supplied credentials of any length are padded identically. */
const PAD_LEN = 64;

function padTo(value: string, len: number): Buffer {
  const buf = Buffer.alloc(len, 0);
  const src = Buffer.from(value, 'utf8');
  src.copy(buf, 0, 0, Math.min(src.length, len));
  return buf;
}

/**
 * Constant-time equal that doesn't throw on length mismatch.
 * Pads both sides to PAD_LEN and compares, then checks length too.
 */
function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = padTo(a, PAD_LEN);
  const bBuf = padTo(b, PAD_LEN);
  const padMatch = timingSafeEqual(aBuf, bBuf);
  const lengthMatch = a.length === b.length;
  // AND them with bitwise to avoid short-circuit timing difference.
  // JS booleans are fine — both evaluate independently, no branch.
  return padMatch && lengthMatch;
}

export type BasicAuthResult =
  | { ok: true }
  | { ok: false; reason: 'env-missing' | 'header-missing' | 'header-malformed' | 'credential-mismatch' };

export function verifyBasicAuth(authHeader: string | null): BasicAuthResult {
  const username = process.env.POSTMARK_WEBHOOK_USERNAME;
  const password = process.env.POSTMARK_WEBHOOK_PASSWORD;

  if (!username || !password) {
    return { ok: false, reason: 'env-missing' };
  }

  if (!authHeader || !authHeader.toLowerCase().startsWith('basic ')) {
    return { ok: false, reason: 'header-missing' };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf-8');
  } catch {
    return { ok: false, reason: 'header-malformed' };
  }

  const sep = decoded.indexOf(':');
  if (sep === -1) {
    return { ok: false, reason: 'header-malformed' };
  }

  const providedUser = decoded.slice(0, sep);
  const providedPass = decoded.slice(sep + 1);

  const userOk = constantTimeEqual(providedUser, username);
  const passOk = constantTimeEqual(providedPass, password);

  if (userOk && passOk) {
    return { ok: true };
  }
  return { ok: false, reason: 'credential-mismatch' };
}

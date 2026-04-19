/**
 * Non-secret fingerprint of `SMS_OTP_HASH_SALT` for parity verification
 * between the Next server and the `sms-otp-send` edge function.
 *
 * Both environments MUST share the same salt value. If one is rotated
 * without the other, `verifySmsOtpAction` silently returns
 * INVALID_CODE_ERROR for every new code — a prod outage that's hard to
 * diagnose from the failure pattern alone (looks like "codes aren't
 * working" rather than "env drift").
 *
 * This helper emits the same fingerprint on both sides. Ops can grep
 * structured logs for `sms_otp_salt_fingerprint=` on the Next server
 * and on the edge function — if the two values differ, the salt is
 * out of sync and `AUTH_V2_SMS` needs a redeploy before SMS works.
 *
 * The fingerprint is a hex prefix of SHA-256("unusonic-sms-salt-canary|" +
 * salt). Reveals nothing about the salt unless you brute-force preimage.
 *
 * See Guardian audit L-3 in docs/audits/login-redesign-build-2026-04-19.md
 * and the matching block in supabase/functions/sms-otp-send/index.ts.
 *
 * @module features/auth/smart-login/lib/sms-salt-fingerprint
 */

import { createHash } from 'crypto';

/** Canary prefix — arbitrary, must match the edge function's value exactly. */
const CANARY_PREFIX = 'unusonic-sms-salt-canary|';

/** Length of the hex fingerprint surfaced in logs. 16 hex chars = 64 bits. */
const FINGERPRINT_HEX_LEN = 16;

/**
 * Returns a 16-char hex fingerprint of the SMS salt, or `null` when the
 * salt env var is missing or empty. Never throws; safe to call from any
 * code path that wants to log parity state.
 */
export function getSmsOtpSaltFingerprint(): string | null {
  const salt = process.env.SMS_OTP_HASH_SALT;
  if (!salt || salt.length === 0) return null;
  return createHash('sha256')
    .update(`${CANARY_PREFIX}${salt}`)
    .digest('hex')
    .slice(0, FINGERPRINT_HEX_LEN);
}

/**
 * Asserts the salt is configured and meets a minimum length. Throws with
 * a loud error if missing or too short. Use at the top of server actions
 * that depend on the salt.
 */
export function assertSmsOtpSaltConfigured(): void {
  const salt = process.env.SMS_OTP_HASH_SALT;
  if (!salt || salt.length < 16) {
    throw new Error(
      'SMS_OTP_HASH_SALT is not configured or is too short (<16 chars). ' +
        'SMS sign-in will not function. See docs/reference/login-redesign-design.md §7.',
    );
  }
}

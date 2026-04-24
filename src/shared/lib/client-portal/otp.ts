/**
 * Client portal OTP challenge helpers.
 *
 * Wraps client_issue_otp_challenge and client_verify_otp RPCs. The raw 6-digit
 * code is returned from issue exactly once and must be sent to the user's
 * email immediately — never stored, logged, or reused.
 *
 * See client-portal-design.md §15.2 (progressive claim flow).
 *
 * @module shared/lib/client-portal/otp
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';

export type OtpPurpose =
  | 'magic_link_login'
  | 'step_up_sign'
  | 'step_up_pay'
  | 'step_up_download'
  | 'step_up_email_change';

export type IssueOtpInput = {
  entityId: string;
  email: string;
  purpose: OtpPurpose;
  ip: string | null;
};

export type IssueOtpResult = {
  challengeId: string;
  codeRaw: string;
  expiresAt: Date;
};

/**
 * Create a new OTP challenge. The raw code is returned once — caller is
 * responsible for emailing it immediately via the workspace-aware sender.
 *
 * Pre-condition: caller has already passed a checkRateLimit('magic_link_email')
 * check on the email.
 */
export async function issueOtpChallenge(input: IssueOtpInput): Promise<IssueOtpResult> {
  const supabase = getSystemClient();

  const { data, error } = await supabase.rpc('client_issue_otp_challenge', {
    p_entity_id: input.entityId,
    p_email: input.email,
    p_purpose: input.purpose,
    p_ip: input.ip ?? undefined,
  });

  if (error) {
    throw new Error(`client_issue_otp_challenge failed: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !row.challenge_id || !row.code_raw || !row.expires_at) {
    throw new Error('client_issue_otp_challenge returned empty result');
  }

  return {
    challengeId: row.challenge_id,
    codeRaw: row.code_raw,
    expiresAt: new Date(row.expires_at),
  };
}

export type VerifyOtpInput = {
  challengeId: string;
  code: string;
  ip: string | null;
};

export type VerifyOtpResult = {
  ok: boolean;
  reason:
    | 'ok'
    | 'not_found'
    | 'already_consumed'
    | 'expired'
    | 'locked'
    | 'bad_code';
  entityId: string | null;
  email: string | null;
  purpose: OtpPurpose | null;
  alreadyClaimed: boolean | null;
};

/**
 * Verify an OTP code against a challenge. On success, the challenge is
 * atomically consumed (single-use). On bad code, attempts is incremented
 * and the challenge locks at 5 failures.
 */
export async function verifyOtpChallenge(input: VerifyOtpInput): Promise<VerifyOtpResult> {
  const supabase = getSystemClient();

  const { data, error } = await supabase.rpc('client_verify_otp', {
    p_challenge_id: input.challengeId,
    p_code: input.code,
    p_ip: input.ip ?? undefined,
  });

  if (error) {
     
    console.error('[client-portal/otp] verify failed', {
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      reason: 'not_found',
      entityId: null,
      email: null,
      purpose: null,
      alreadyClaimed: null,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      ok: false,
      reason: 'not_found',
      entityId: null,
      email: null,
      purpose: null,
      alreadyClaimed: null,
    };
  }

  return {
    ok: row.ok ?? false,
    reason: (row.reason ?? 'not_found') as VerifyOtpResult['reason'],
    entityId: row.entity_id ?? null,
    email: row.email ?? null,
    purpose: (row.purpose ?? null) as OtpPurpose | null,
    alreadyClaimed: row.already_claimed,
  };
}

/**
 * SMS transport core — direct Twilio API, no SDK.
 *
 * The Phase 6 login redesign uses a Deno edge function (`sms-otp-send`)
 * for the OTP flow because that path needs cross-runtime JWT verification.
 * Generic transactional SMS (e.g. the BYO rescue handoff) doesn't — it
 * already runs in a Node server action with workspace context resolved.
 * So we POST to Twilio's REST API directly and skip the edge-function
 * round-trip.
 *
 * Twilio creds come from the same env vars the edge function reads
 * (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`).
 *
 * Pure recipient validators live in `./validation.ts` — kept out of this
 * server-only module so the dialog UI can import them client-side.
 *
 * @module shared/api/sms/core
 */

import 'server-only';
import { normalizePhoneE164 } from './validation';

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
};

/** Read Twilio creds at send-time so env is available when actions run. */
function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) return null;
  return { accountSid, authToken, fromNumber };
}

export type SendSmsResult =
  | { ok: true; sid: string | null }
  | { ok: false; error: string };

/**
 * Send a transactional SMS via Twilio. Direct REST call, basic auth.
 *
 * Body should fit one segment (160 GSM-7 chars / 70 UCS-2 chars) when
 * possible to keep cost down; multi-segment is fine but bills per segment.
 */
export async function sendSms(opts: { to: string; body: string }): Promise<SendSmsResult> {
  const config = getTwilioConfig();
  if (!config) {
    return { ok: false, error: 'SMS not configured (Twilio env missing).' };
  }

  const normalized = normalizePhoneE164(opts.to);
  if (!normalized) {
    return { ok: false, error: 'Recipient is not a valid phone number.' };
  }

  const url = `${TWILIO_API_BASE}/${config.accountSid}/Messages.json`;
  const auth = Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64');
  const params = new URLSearchParams({
    To: normalized,
    From: config.fromNumber,
    Body: opts.body,
  });

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Twilio request failed: ${msg}` };
  }

  if (!resp.ok) {
    let detail = '';
    try {
      const text = await resp.text();
      detail = text.slice(0, 200);
    } catch {
      // ignore
    }
    return {
      ok: false,
      error: `Twilio rejected the message (${resp.status}): ${detail || 'no body'}`,
    };
  }

  let sid: string | null = null;
  try {
    const data = (await resp.json()) as { sid?: string };
    sid = data.sid ?? null;
  } catch {
    // Body parsing failure is non-fatal; the 2xx already confirmed acceptance.
  }
  return { ok: true, sid };
}

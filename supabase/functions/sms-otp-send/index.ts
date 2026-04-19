/**
 * sms-otp-send — Phase 6 edge function (Login Redesign).
 *
 * Sends a 6-digit one-time sign-in code via Twilio to the caller's
 * registered `auth.users.phone`. The hashed code is persisted to
 * `public.sms_otp_codes`; the server action `verifySmsOtpAction` is the
 * only consumer of that hash.
 *
 * ## Why bespoke Twilio, not Supabase's phone provider?
 *
 * Supabase's built-in `signInWithOtp({ phone })` would work but only if
 * we configured Twilio at the Supabase dashboard level. We want workspace
 * opt-in gating (per-workspace `sms_signin_enabled`), bespoke rate
 * limits, and control over the SMS copy/brand. Calling Twilio directly
 * gives us that; the only thing we still use Supabase for is the final
 * session-establishment step (done in `verifySmsOtpAction`, not here).
 *
 * ## Contract
 *
 * - Auth: `Authorization: Bearer <user JWT>` — rejected otherwise. The
 *   caller is the user who just requested a code; we read their
 *   `auth.users.phone` and workspace memberships via the service client.
 * - Method: POST (JSON body unused for now; all context from the JWT).
 * - Returns (200):  `{ ok: true, expires_at: string }`
 * - Returns (403):  `{ ok: false, error: 'not_available' }` — bucket for
 *                   (a) no phone on user, (b) no workspace opted in.
 * - Returns (429):  `{ ok: false, error: 'rate_limited', retry_after: 3600 }`
 * - Returns (503):  `{ ok: false, error: 'twilio_failed' }` — no
 *                   attempt row is persisted; user retains their quota.
 * - Returns (401):  on missing/invalid JWT.
 *
 * ## Non-negotiables
 *
 * 1. **Enumeration-safe "not available".** The same error body is returned
 *    whether the user has no phone, or no workspace has opted in.
 * 2. **Rate limit BEFORE Twilio.** 5/hr/user, 10/hr/ip_hash. Count taken
 *    BEFORE the Twilio POST so we never send past quota.
 * 3. **Persist AFTER Twilio success.** If Twilio returns non-2xx, we do
 *    NOT increment rate-limit counters — a third-party outage must not
 *    consume the user's quota.
 * 4. **Never log the raw code or raw phone number.** The code lives in
 *    memory long enough to POST to Twilio and hash; the phone number is
 *    hashed before any log emission.
 * 5. **Hashed persistence.** Only the SHA-256 of `code + user_id + SALT`
 *    is written to `sms_otp_codes.code_hash`.
 *
 * @module supabase/functions/sms-otp-send
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

// ─── Environment ────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_FROM_NUMBER = Deno.env.get('TWILIO_FROM_NUMBER') ?? '';
const SMS_OTP_HASH_SALT = Deno.env.get('SMS_OTP_HASH_SALT') ?? '';

// ─── Constants ──────────────────────────────────────────────────────────────
const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_PER_USER = 5;
const RATE_PER_IP = 10;

// Enumeration-safe error body. Caller sees the same shape regardless of
// whether the rejection was (a) no phone, (b) no workspace opt-in, or (c)
// both. Rate-limit uses a different error code on purpose — the caller
// already knows they just pressed the button, so telling them "slow down"
// leaks nothing.
const NOT_AVAILABLE_BODY = JSON.stringify({
  ok: false,
  error: 'not_available',
});
const UNAUTHORIZED_BODY = JSON.stringify({ ok: false, error: 'unauthorized' });
const TWILIO_FAILED_BODY = JSON.stringify({ ok: false, error: 'twilio_failed' });

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Best-effort first-hop IP extraction. Fallback to '0.0.0.0' only for hashing. */
function readClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return '0.0.0.0';
}

/**
 * SHA-256 hex digest. Used for both code_hash (salted with user_id + env
 * salt) and ip_hash (salted with env salt alone).
 */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash for the code stored in sms_otp_codes.code_hash. Salted per-user +
 * env salt so a dump of the table alone is not enough to brute-force
 * codes. The code itself is 6 digits so a motivated attacker with both
 * the table and the salt could still enumerate — which is why we cap
 * attempts and expire in 10 minutes.
 */
async function hashCode(code: string, userId: string): Promise<string> {
  return sha256Hex(`${code}|${userId}|${SMS_OTP_HASH_SALT}`);
}

/** Hash for ip tracking. Keeps the raw IP out of the DB. */
async function hashIp(ip: string): Promise<string> {
  return sha256Hex(`ip|${ip}|${SMS_OTP_HASH_SALT}`);
}

/** Random 6-digit code (leading zeros permitted). */
function generateCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0] % 1_000_000;
  return n.toString().padStart(6, '0');
}

/** Basic-auth header for Twilio REST. */
function twilioBasicAuth(): string {
  const creds = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`;
  return `Basic ${btoa(creds)}`;
}

/**
 * POSTs to Twilio Messages API. Returns `ok: true` only on 2xx; anything
 * else (including network error) is `ok: false`. Twilio's own response
 * body is NOT returned — we don't want the SMS text or phone number
 * leaking through a caller-accessible error string.
 */
async function sendTwilioSms(to: string, body: string): Promise<{ ok: boolean; status: number }> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', TWILIO_FROM_NUMBER);
  form.set('Body', body);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: twilioBasicAuth(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

// ─── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Guard: refuse to run if required secrets are missing. Better to fail
  // closed than to silently stop sending.
  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !TWILIO_ACCOUNT_SID ||
    !TWILIO_AUTH_TOKEN ||
    !TWILIO_FROM_NUMBER ||
    !SMS_OTP_HASH_SALT
  ) {
    return new Response(JSON.stringify({ ok: false, error: 'not_configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 1. Verify caller JWT. ────────────────────────────────────────────────
  // Two legal callers:
  //   (a) An authenticated user (Authorization: Bearer <user-JWT>). The
  //       edge function is public + verified at the JWT layer; this is the
  //       direct-from-browser path (not used today; kept for future
  //       self-service flows).
  //   (b) The Next.js server action using the service role key, with the
  //       target user_id passed in the request body AND a trusted-caller
  //       marker header. The service key is secret to the server; if the
  //       header + body land without the key, the request is rejected.
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return new Response(UNAUTHORIZED_BODY, {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const jwt = authHeader.slice('bearer '.length).trim();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Parse body up front so we can pick the user id either from the JWT
  // (user-JWT path) or from the body (server-impersonation path).
  let parsedBody: { user_id?: unknown } | null = null;
  try {
    parsedBody = (await req.json()) as { user_id?: unknown };
  } catch {
    parsedBody = null;
  }

  const impersonate = req.headers.get('x-sms-otp-impersonate') === '1';
  const isServiceKey = jwt === SUPABASE_SERVICE_ROLE_KEY;

  let userId: string;
  let phone = '';

  if (impersonate && isServiceKey) {
    // Server-impersonation path: trust the body user_id and read phone
    // from auth.users directly (service role has access).
    const bodyUserId = typeof parsedBody?.user_id === 'string' ? parsedBody.user_id : '';
    if (!bodyUserId) {
      return new Response(UNAUTHORIZED_BODY, {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const { data: targetUser, error: lookupErr } = await admin.auth.admin.getUserById(bodyUserId);
    if (lookupErr || !targetUser?.user?.id) {
      return new Response(UNAUTHORIZED_BODY, {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    userId = targetUser.user.id;
    phone = targetUser.user.phone ?? '';
  } else {
    // User-JWT path.
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
      return new Response(UNAUTHORIZED_BODY, {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    userId = userData.user.id;
    phone = userData.user.phone ?? '';
  }

  // ── 2. Workspace opt-in + phone-present check (enumeration-safe). ───────
  // Combined into a single decision so the two failure reasons are
  // indistinguishable to the caller.
  const { data: memberRows, error: memberErr } = await admin
    .from('workspace_members')
    .select('workspace_id, workspaces:workspace_id(sms_signin_enabled)')
    .eq('user_id', userId);

  if (memberErr) {
    // Fail closed — upstream read error shouldn't leak as "not_available"
    // plus succeed later; 503 keeps the UI honest.
    return new Response(TWILIO_FAILED_BODY, {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const anyWorkspaceOptedIn = (memberRows ?? []).some((row) => {
    // Supabase types for the joined row are loose; the workspaces object
    // may arrive as either a single row or an array depending on the FK
    // metadata. Handle both.
    const ws = (row as { workspaces?: unknown }).workspaces;
    if (Array.isArray(ws)) {
      return ws.some((w: { sms_signin_enabled?: boolean }) => w?.sms_signin_enabled === true);
    }
    if (ws && typeof ws === 'object') {
      return (ws as { sms_signin_enabled?: boolean }).sms_signin_enabled === true;
    }
    return false;
  });

  if (!phone || !anyWorkspaceOptedIn) {
    return new Response(NOT_AVAILABLE_BODY, {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 3. Rate limit — BEFORE Twilio. ───────────────────────────────────────
  const ip = readClientIp(req);
  const ipHash = await hashIp(ip);
  const windowStartIso = new Date(Date.now() - RATE_WINDOW_MS).toISOString();

  const [userCount, ipCount] = await Promise.all([
    admin
      .from('sms_otp_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('sent_at', windowStartIso),
    admin
      .from('sms_otp_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gte('sent_at', windowStartIso),
  ]);

  if ((userCount.count ?? 0) >= RATE_PER_USER || (ipCount.count ?? 0) >= RATE_PER_IP) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'rate_limited',
        retry_after: Math.ceil(RATE_WINDOW_MS / 1000),
      }),
      {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // ── 4. Generate + store hashed code. ─────────────────────────────────────
  const code = generateCode();
  const codeHash = await hashCode(code, userId);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  // Store BEFORE sending Twilio: if the insert fails we return early
  // without touching Twilio. If Twilio then fails we simply leave the
  // row sitting expired — no attempt row is created so rate limit is
  // unaffected. The `sms_otp_codes` table is RLS-locked; this insert
  // runs via service role.
  const { error: insertErr } = await admin.from('sms_otp_codes').insert({
    user_id: userId,
    code_hash: codeHash,
    attempts: 0,
    expires_at: expiresAt,
  });
  if (insertErr) {
    return new Response(TWILIO_FAILED_BODY, {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 5. Deliver via Twilio. ───────────────────────────────────────────────
  const smsBody = `Your Unusonic sign-in code: ${code}. Expires in 10 minutes.`;
  const twilio = await sendTwilioSms(phone, smsBody);

  if (!twilio.ok) {
    // Do NOT persist an attempt row — the user's quota is preserved when
    // our provider fails. The code row we already wrote will simply
    // expire and be purged; the user can re-try.
    return new Response(TWILIO_FAILED_BODY, {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── 6. Persist the attempt row — only after Twilio 2xx. ──────────────────
  const { error: attemptErr } = await admin.from('sms_otp_attempts').insert({
    user_id: userId,
    ip_hash: ipHash,
  });
  if (attemptErr) {
    // The SMS already went out. We swallow the attempt-log failure — the
    // worst case is the user gets one extra send this hour. That's much
    // better than returning an error after the code hit their phone.
    // Log to stdout for ops investigation (hashed, no raw phone).
    console.log(
      JSON.stringify({
        event: 'sms_otp_attempt_log_failed',
        user_id_hash: await sha256Hex(userId),
        error: attemptErr.message,
      }),
    );
  }

  return new Response(JSON.stringify({ ok: true, expires_at: expiresAt }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

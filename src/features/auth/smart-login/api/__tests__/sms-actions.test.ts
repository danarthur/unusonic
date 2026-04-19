/**
 * Phase 6 — `sendSmsOtpAction` + `verifySmsOtpAction` + `toggleSmsSigninEnabled`.
 *
 * We mock the three heavy dependencies (service role client, Supabase
 * server client, and the edge-function fetch) so the tests exercise the
 * enumeration-safe branching, flag gating, and verification cryptography
 * in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const adminUsersFetchMock = vi.fn();
  const edgeFunctionFetchMock = vi.fn();
  const systemFromMock = vi.fn();
  const generateLinkMock = vi.fn();
  const verifyOtpMock = vi.fn();
  const createServerClientMock = vi.fn();
  const rpcMock = vi.fn();
  const updateMock = vi.fn();

  const consoleLogSpy = vi.fn();

  return {
    adminUsersFetchMock,
    edgeFunctionFetchMock,
    systemFromMock,
    generateLinkMock,
    verifyOtpMock,
    createServerClientMock,
    rpcMock,
    updateMock,
    consoleLogSpy,
  };
});

const {
  adminUsersFetchMock,
  edgeFunctionFetchMock,
  systemFromMock,
  generateLinkMock,
  verifyOtpMock,
  createServerClientMock,
  rpcMock,
  updateMock,
  consoleLogSpy,
} = hoisted;

// Global fetch dispatcher — routes admin/users and edge function calls.
const fetchRouter = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.includes('/auth/v1/admin/users')) {
    return adminUsersFetchMock(url, init);
  }
  if (url.includes('/functions/v1/sms-otp-send')) {
    return edgeFunctionFetchMock(url, init);
  }
  throw new Error(`Unexpected fetch to: ${url}`);
});

vi.stubGlobal('fetch', fetchRouter);

// --- Mocks ---
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn(),
  }),
  headers: vi.fn().mockResolvedValue(
    new Headers({
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      'x-forwarded-for': '203.0.113.42',
    }),
  ),
}));

vi.mock('@sentry/nextjs', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: hoisted.createServerClientMock,
}));

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(() => ({
    from: hoisted.systemFromMock,
    rpc: hoisted.rpcMock,
    auth: {
      admin: {
        generateLink: hoisted.generateLinkMock,
      },
    },
  })),
}));

// --- Import under test ---
import {
  sendSmsOtpAction,
  verifySmsOtpAction,
  toggleSmsSigninEnabled,
} from '../sms-actions';

beforeEach(() => {
  process.env.AUTH_TELEMETRY_SALT = 'test-salt';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SMS_OTP_HASH_SALT = 'hash-salt-long-enough-for-assertion';
  process.env.AUTH_V2_SMS = '1';

  adminUsersFetchMock.mockReset();
  edgeFunctionFetchMock.mockReset();
  systemFromMock.mockReset();
  generateLinkMock.mockReset();
  verifyOtpMock.mockReset();
  createServerClientMock.mockReset();
  rpcMock.mockReset();
  updateMock.mockReset();
  fetchRouter.mockClear();

  consoleLogSpy.mockReset();
  vi.spyOn(console, 'log').mockImplementation(consoleLogSpy);

  // Default happy-path mocks.
  // The email → user_id lookup now goes through the `get_user_id_by_email`
  // RPC on the system client (post-GoTrue-filter-lie fix). Tests that want
  // the "unknown email" path override this per-test with
  // `rpcMock.mockResolvedValueOnce({ data: null, error: null })`.
  rpcMock.mockResolvedValue({ data: 'user-1', error: null });
  adminUsersFetchMock.mockResolvedValue(
    new Response(JSON.stringify({ users: [{ id: 'user-1' }] }), { status: 200 }),
  );
});

afterEach(() => {
  delete process.env.AUTH_TELEMETRY_SALT;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SMS_OTP_HASH_SALT;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTH_V2_')) delete process.env[key];
  }
  vi.restoreAllMocks();
});

// ─── sendSmsOtpAction ───────────────────────────────────────────────────────

describe('sendSmsOtpAction — flag gate', () => {
  it('returns not_available when AUTH_V2_SMS is OFF', async () => {
    delete process.env.AUTH_V2_SMS;

    const result = await sendSmsOtpAction({ email: 'user@example.com' });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/not available/i);
    }
    // Critically, no edge-function call was made when the flag is off.
    expect(edgeFunctionFetchMock).not.toHaveBeenCalled();
  });
});

describe('sendSmsOtpAction — enumeration safety', () => {
  it('returns the same "not available" error for malformed email and unknown user', async () => {
    const malformed = await sendSmsOtpAction({ email: 'not-an-email' });
    expect(malformed.ok).toBe(false);
    if (malformed.ok === false) {
      expect(malformed.error).toMatch(/not available/i);
    }

    // Unknown email: the get_user_id_by_email RPC returns null.
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    const unknown = await sendSmsOtpAction({ email: 'ghost@example.com' });
    expect(unknown.ok).toBe(false);
    if (unknown.ok === false) {
      expect(unknown.error).toMatch(/not available/i);
    }

    // Both return the literally identical error string.
    if (malformed.ok === false && unknown.ok === false) {
      expect(malformed.error).toBe(unknown.error);
    }
  });

  it('maps edge-function "not_available" to the same error without revealing the scope', async () => {
    edgeFunctionFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: 'not_available' }), { status: 403 }),
    );

    const result = await sendSmsOtpAction({ email: 'user@example.com' });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/not available/i);
    }
  });
});

describe('sendSmsOtpAction — happy path', () => {
  it('returns expiresAt on edge-function success and emits sms_sent telemetry', async () => {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    edgeFunctionFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, expires_at: expiresAt }), { status: 200 }),
    );

    const result = await sendSmsOtpAction({ email: 'user@example.com' });
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.expiresAt).toBe(expiresAt);
    }

    const emitted = consoleLogSpy.mock.calls
      .map((c) => c[0])
      .filter((c) => typeof c === 'string' && c.includes('continue_resolved'))
      .map((c) => JSON.parse(c));
    const latest = emitted[emitted.length - 1];
    expect(latest?.resolution).toBe('sms_sent');
  });

  it('forwards x-forwarded-for to the edge function for true-client rate-limit keying', async () => {
    edgeFunctionFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: true, expires_at: new Date().toISOString() }),
        { status: 200 },
      ),
    );

    await sendSmsOtpAction({ email: 'user@example.com' });

    const [, init] = edgeFunctionFetchMock.mock.calls[0];
    const h = (init?.headers ?? {}) as Record<string, string>;
    expect(h['x-forwarded-for']).toBe('203.0.113.42');
    // Marker header is mandatory for the impersonation path.
    expect(h['x-sms-otp-impersonate']).toBe('1');
  });
});

describe('sendSmsOtpAction — rate limit surfacing', () => {
  it('returns a rate_limited error with retry_after when the edge function throttles', async () => {
    edgeFunctionFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ok: false, error: 'rate_limited', retry_after: 3600 }),
        { status: 429 },
      ),
    );

    const result = await sendSmsOtpAction({ email: 'user@example.com' });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/too many/i);
      expect(result.retryAfterSeconds).toBe(3600);
    }
  });
});

// ─── verifySmsOtpAction ─────────────────────────────────────────────────────

describe('verifySmsOtpAction — flag gate', () => {
  it('returns invalid when AUTH_V2_SMS is OFF', async () => {
    delete process.env.AUTH_V2_SMS;
    const result = await verifySmsOtpAction({ email: 'user@example.com', code: '123456' });
    expect(result.ok).toBe(false);
  });
});

describe('verifySmsOtpAction — hash compare', () => {
  async function expectedHash(code: string, userId: string, salt: string): Promise<string> {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${code}|${userId}|${salt}`),
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  it('accepts a correct code, marks consumed, establishes a session', async () => {
    const stored = await expectedHash('123456', 'user-1', 'hash-salt-long-enough-for-assertion');

    // Build a chainable stub for `system.from('sms_otp_codes')`.
    const codesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'code-1',
          code_hash: stored,
          attempts: 0,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          consumed_at: null,
        },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    };
    systemFromMock.mockImplementation(() => codesBuilder);

    generateLinkMock.mockResolvedValueOnce({
      data: { properties: { hashed_token: 'abc123' } },
      error: null,
    });

    createServerClientMock.mockResolvedValue({
      auth: { verifyOtp: verifyOtpMock.mockResolvedValueOnce({ error: null }) },
    });

    const result = await verifySmsOtpAction({
      email: 'user@example.com',
      code: '123456',
    });

    expect(result.ok).toBe(true);
    expect(codesBuilder.update).toHaveBeenCalled();
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'magiclink', email: 'user@example.com' }),
    );
    expect(verifyOtpMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'magiclink', token_hash: 'abc123' }),
    );
  });

  it('rejects a wrong code and never calls generateLink', async () => {
    const storedForOther = await expectedHash('999999', 'user-1', 'hash-salt-long-enough-for-assertion');

    const codesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'code-1',
          code_hash: storedForOther,
          attempts: 0,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          consumed_at: null,
        },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    };
    systemFromMock.mockImplementation(() => codesBuilder);

    const result = await verifySmsOtpAction({
      email: 'user@example.com',
      code: '123456',
    });

    expect(result.ok).toBe(false);
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('rejects after 5 attempts', async () => {
    const stored = await expectedHash('123456', 'user-1', 'hash-salt-long-enough-for-assertion');

    const codesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'code-1',
          code_hash: stored,
          attempts: 5,
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          consumed_at: null,
        },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    };
    systemFromMock.mockImplementation(() => codesBuilder);

    const result = await verifySmsOtpAction({
      email: 'user@example.com',
      code: '123456',
    });
    expect(result.ok).toBe(false);
    // Even with a matching code, 5 attempts blocks.
    expect(generateLinkMock).not.toHaveBeenCalled();
  });

  it('rejects when the code has expired', async () => {
    const stored = await expectedHash('123456', 'user-1', 'hash-salt-long-enough-for-assertion');

    const codesBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'code-1',
          code_hash: stored,
          attempts: 0,
          expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
          consumed_at: null,
        },
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
    };
    systemFromMock.mockImplementation(() => codesBuilder);

    const result = await verifySmsOtpAction({
      email: 'user@example.com',
      code: '123456',
    });
    expect(result.ok).toBe(false);
  });
});

// ─── toggleSmsSigninEnabled ─────────────────────────────────────────────────

describe('toggleSmsSigninEnabled', () => {
  it('blocks when caller is unauthenticated', async () => {
    createServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const result = await toggleSmsSigninEnabled('ws-1', true);
    expect(result.ok).toBe(false);
  });

  it('blocks when user_has_workspace_role returns false', async () => {
    createServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u' } } }) },
      rpc: rpcMock.mockResolvedValue({ data: false, error: null }),
      from: vi.fn(),
    });

    const result = await toggleSmsSigninEnabled('ws-1', true);
    expect(result.ok).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith('user_has_workspace_role', {
      p_workspace_id: 'ws-1',
      p_roles: ['owner', 'admin'],
    });
  });

  it('persists the change when caller is an owner', async () => {
    const fromBuilder = {
      update: updateMock.mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    createServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u' } } }) },
      rpc: rpcMock.mockResolvedValue({ data: true, error: null }),
      from: vi.fn(() => fromBuilder),
    });

    const result = await toggleSmsSigninEnabled('ws-1', true);
    expect(result.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ sms_signin_enabled: true });
  });
});

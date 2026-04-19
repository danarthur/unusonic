/**
 * Phase 2 — `sendMagicLinkAction` contract.
 *
 * We test the server-action surface end-to-end with the heavy dependencies
 * mocked (service-role client, Resend sender, Sentry). The goal is to lock
 * down the four invariants from the Phase 2 spec:
 *
 *   1. Happy path: `auth.admin.generateLink` + email send + success payload.
 *   2. Rate-limit branch: returns a non-revealing error; no link generated.
 *   3. Email-send failure: returns a generic error; telemetry emitted.
 *   4. Telemetry emits `continue_resolved` for every resolvable press.
 *
 * The in-memory rate limiter has its own dedicated unit tests in the
 * `lib/__tests__` folder; we only verify the wiring here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const generateLinkMock = vi.fn(async () => ({
    data: {
      properties: { action_link: 'https://app.example.com/verify#access_token=X' },
    },
    error: null,
  }));

  const sendMagicLinkSignInMock = vi.fn<
    (params: {
      targetEmail: string;
      magicLinkUrl: string;
      expiresMinutes?: number;
      userAgentClass?: string;
    }) => Promise<{ ok: true } | { ok: false; error: string }>
  >(async () => ({ ok: true }));

  const consoleLogSpy = vi.fn();

  return {
    generateLinkMock,
    sendMagicLinkSignInMock,
    consoleLogSpy,
  };
});

const { generateLinkMock, sendMagicLinkSignInMock, consoleLogSpy } = hoisted;

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
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
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
  // sendMagicLinkAction doesn't call the authed server client, but it's
  // imported at module top; return a stub so import doesn't explode.
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(() => ({
    auth: { admin: { generateLink: hoisted.generateLinkMock } },
  })),
}));

vi.mock('@/shared/api/email/send', () => ({
  sendMagicLinkSignIn: hoisted.sendMagicLinkSignInMock,
}));

// --- Import under test (after mocks) ---
import { sendMagicLinkAction } from '../actions';
import { __resetMagicLinkRateLimitStore } from '../../lib/magic-link-rate-limit';

beforeEach(() => {
  process.env.AUTH_TELEMETRY_SALT = 'test-salt';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';

  generateLinkMock.mockReset();
  generateLinkMock.mockResolvedValue({
    data: {
      properties: { action_link: 'https://app.example.com/verify#access_token=X' },
    },
    error: null,
  });

  sendMagicLinkSignInMock.mockReset();
  sendMagicLinkSignInMock.mockResolvedValue({ ok: true });

  consoleLogSpy.mockReset();
  // Capture telemetry (emitted via console.log) so we can assert events
  // without plumbing a custom sink.
  vi.spyOn(console, 'log').mockImplementation(consoleLogSpy);

  __resetMagicLinkRateLimitStore();
});

afterEach(() => {
  delete process.env.AUTH_TELEMETRY_SALT;
  delete process.env.NEXT_PUBLIC_APP_URL;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTH_V2_')) delete process.env[key];
  }
  vi.restoreAllMocks();
});

/** Pulls the latest `continue_resolved` telemetry event from the spy. */
function latestTelemetry(): Record<string, unknown> | null {
  for (let i = consoleLogSpy.mock.calls.length - 1; i >= 0; i--) {
    const arg = consoleLogSpy.mock.calls[i]?.[0];
    if (typeof arg === 'string' && arg.includes('continue_resolved')) {
      try {
        return JSON.parse(arg);
      } catch {
        // noop
      }
    }
  }
  return null;
}

describe('sendMagicLinkAction — validation', () => {
  it('returns a validation error on a malformed email and does not call the service client', async () => {
    const result = await sendMagicLinkAction('not-an-email');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/valid email/i);
    }
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(sendMagicLinkSignInMock).not.toHaveBeenCalled();
  });
});

describe('sendMagicLinkAction — happy path', () => {
  it('generates a magic link, sends the email, and returns expiresAt', async () => {
    const result = await sendMagicLinkAction('user@example.com');

    expect(result.ok).toBe(true);
    if (result.ok === true) {
      // expiresAt should be ~60min out, parseable, and in the future
      const t = new Date(result.expiresAt).getTime();
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThan(Date.now());
    }

    expect(generateLinkMock).toHaveBeenCalledTimes(1);
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'magiclink',
        email: 'user@example.com',
        options: expect.objectContaining({
          redirectTo: expect.stringContaining('/login'),
        }),
      }),
    );

    expect(sendMagicLinkSignInMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targetEmail: 'user@example.com',
        magicLinkUrl: 'https://app.example.com/verify#access_token=X',
        expiresMinutes: 60,
        // Mac UA from the headers mock
        userAgentClass: 'mac',
      }),
    );
  });

  it('emits a `magic_link` resolution event', async () => {
    await sendMagicLinkAction('user@example.com');

    const evt = latestTelemetry();
    expect(evt).toBeTruthy();
    expect(evt?.event).toBe('continue_resolved');
    expect(evt?.resolution).toBe('magic_link');
    // email must NEVER appear raw in the event
    expect(JSON.stringify(evt)).not.toContain('user@example.com');
  });

  it('normalizes case/whitespace before calling the admin client', async () => {
    await sendMagicLinkAction('  USER@Example.COM ');
    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com' }),
    );
  });
});

describe('sendMagicLinkAction — failure paths', () => {
  it('returns a generic error when generateLink fails and emits `unknown`', async () => {
    generateLinkMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'upstream outage' },
    } as never);

    const result = await sendMagicLinkAction('user@example.com');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/sign-in link/i);
    }
    expect(sendMagicLinkSignInMock).not.toHaveBeenCalled();

    const evt = latestTelemetry();
    expect(evt?.resolution).toBe('unknown');
  });

  it('returns a generic error when the email send fails and emits `unknown`', async () => {
    sendMagicLinkSignInMock.mockResolvedValueOnce({ ok: false, error: 'SMTP down' });

    const result = await sendMagicLinkAction('user@example.com');

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/sign-in link/i);
    }
    expect(generateLinkMock).toHaveBeenCalledTimes(1);

    const evt = latestTelemetry();
    expect(evt?.resolution).toBe('unknown');
  });
});

describe('sendMagicLinkAction — rate limiting', () => {
  it('rejects after 5 sends for the same email within the window', async () => {
    // 5 are allowed for the email bucket (<= ipLimit=10).
    for (let i = 0; i < 5; i++) {
      const ok = await sendMagicLinkAction('user@example.com');
      expect(ok.ok).toBe(true);
    }

    // 6th must rate-limit.
    const blocked = await sendMagicLinkAction('user@example.com');
    expect(blocked.ok).toBe(false);
    if (blocked.ok === false) {
      expect(blocked.error).toMatch(/too many/i);
    }

    // The service client must NOT be called on the throttled press.
    expect(generateLinkMock).toHaveBeenCalledTimes(5);
    expect(sendMagicLinkSignInMock).toHaveBeenCalledTimes(5);

    const evt = latestTelemetry();
    expect(evt?.resolution).toBe('rate_limited');
  });

  it('rejects on IP bucket overflow even with different emails', async () => {
    // 10 distinct emails → email-bucket limit never hits, but IP limit does.
    for (let i = 0; i < 10; i++) {
      const ok = await sendMagicLinkAction(`user${i}@example.com`);
      expect(ok.ok).toBe(true);
    }

    const blocked = await sendMagicLinkAction('extra@example.com');
    expect(blocked.ok).toBe(false);
    expect(generateLinkMock).toHaveBeenCalledTimes(10);
  });
});

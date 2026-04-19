/**
 * Phase 4 — `resolveContinueAction` enumeration-guard contract.
 *
 * This is the **spec-locked** test file. The design doc §3.1 requires:
 *
 *   1. All three non-passkey branches (account, ghost, unknown) return
 *      the exact same caller-visible shape (`{ kind: 'magic-link' }`).
 *   2. The dummy-compare runs regardless of branch — including the
 *      "no match at all" path.
 *   3. A jitter floor of ≥ 400ms is enforced on every non-passkey
 *      response (tests verify presence, not wall time).
 *   4. Rate-limited throttles map to the same `magic-link` response.
 *   5. Telemetry emits `ghost_match_on_signin` only when a ghost matches.
 *
 * Heavy dependencies (Supabase admin lookup, service client, email
 * senders) are mocked at the module boundary. The delay is swapped for
 * an injected no-op so the suite runs in < 500ms.
 *
 * NB: the jitter-floor assertion counts the number of delay calls, not
 * the sleep — the dedicated enumeration-guard unit test exercises the
 * actual clock math.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const fetchMock = vi.fn();
  const rpcMock = vi.fn();
  const passkeyCountMock = vi.fn();
  const ghostLookupMock = vi.fn();
  const generateLinkMock = vi.fn();
  const sendMagicLinkSignInMock = vi.fn();
  const sendGhostClaimEmailMock = vi.fn();
  const sendUnknownEmailSignupEmailMock = vi.fn();
  const consoleLogSpy = vi.fn();
  const dummyCompareMock = vi.fn();
  const delayToFloorMock = vi.fn();
  return {
    fetchMock,
    rpcMock,
    passkeyCountMock,
    ghostLookupMock,
    generateLinkMock,
    sendMagicLinkSignInMock,
    sendGhostClaimEmailMock,
    sendUnknownEmailSignupEmailMock,
    consoleLogSpy,
    dummyCompareMock,
    delayToFloorMock,
  };
});

// Mocks must be declared before the import.
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
      'x-forwarded-for': '203.0.113.99',
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
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: null } })) },
  })),
}));

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(() => ({
    auth: { admin: { generateLink: hoisted.generateLinkMock } },
    rpc: hoisted.rpcMock,
    from: (table: string) => {
      if (table === 'passkeys') {
        return {
          select: () => ({
            eq: () => hoisted.passkeyCountMock(),
          }),
        };
      }
      return {};
    },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- schema argument is part of the Supabase client contract; ignored in this stub
    schema: (_schema: string) => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            is: () => ({
              filter: () => ({
                limit: () => ({
                  maybeSingle: () => hoisted.ghostLookupMock(),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  })),
}));

vi.mock('@/shared/api/email/send', () => ({
  sendMagicLinkSignIn: hoisted.sendMagicLinkSignInMock,
  sendGhostClaimEmail: hoisted.sendGhostClaimEmailMock,
  sendUnknownEmailSignupEmail: hoisted.sendUnknownEmailSignupEmailMock,
}));

// Inject a no-op delay so the jitter floor doesn't slow the suite.
vi.mock('../../lib/enumeration-guard', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/enumeration-guard')>();
  return {
    ...actual,
    runDummyCompare: (...args: Parameters<typeof actual.runDummyCompare>) => {
      hoisted.dummyCompareMock(...args);
      return actual.runDummyCompare(...args);
    },
    delayToFloor: async (elapsedMs: number) => {
      hoisted.delayToFloorMock(elapsedMs);
      // intentionally do not sleep
    },
  };
});

// fetch for admin/users lookup.
const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.AUTH_TELEMETRY_SALT = 'test-salt';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.com';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

  hoisted.fetchMock.mockReset();
  hoisted.rpcMock.mockReset();
  hoisted.passkeyCountMock.mockReset();
  hoisted.ghostLookupMock.mockReset();
  hoisted.generateLinkMock.mockReset();
  hoisted.sendMagicLinkSignInMock.mockReset().mockResolvedValue({ ok: true });
  hoisted.sendGhostClaimEmailMock.mockReset().mockResolvedValue({ ok: true });
  hoisted.sendUnknownEmailSignupEmailMock
    .mockReset()
    .mockResolvedValue({ ok: true });
  hoisted.consoleLogSpy.mockReset();
  hoisted.dummyCompareMock.mockReset();
  hoisted.delayToFloorMock.mockReset();

  // Default: no user, no ghost. Override per test.
  // The email → user_id lookup now uses the `get_user_id_by_email` RPC
  // on the service-role client (post-GoTrue-filter-lie fix). `fetchMock`
  // is retained only for the passkey-presence probe path (currently
  // exercised via `passkeyCountMock` instead — kept for future use).
  hoisted.rpcMock.mockResolvedValue({ data: null, error: null });
  hoisted.fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ users: [] }),
  });
  hoisted.passkeyCountMock.mockResolvedValue({ count: 0, error: null });
  hoisted.ghostLookupMock.mockResolvedValue({ data: null, error: null });
  hoisted.generateLinkMock.mockResolvedValue({
    data: {
      properties: {
        action_link: 'https://app.example.com/verify#access_token=X',
      },
    },
    error: null,
  });

  globalThis.fetch = hoisted.fetchMock as unknown as typeof fetch;
  vi.spyOn(console, 'log').mockImplementation(hoisted.consoleLogSpy);
});

afterEach(async () => {
  delete process.env.AUTH_TELEMETRY_SALT;
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('AUTH_V2_')) delete process.env[key];
  }
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();

  // Reset the singleton rate-limit store between tests so the bucket
  // does not bleed across cases.
  const mod = await import('../../lib/magic-link-rate-limit');
  mod.__resetMagicLinkRateLimitStore();
});

// Import after all mocks.
import { resolveContinueAction } from '../actions';

// ────────────────────────────────────────────────────────────────────
// Happy-path branches
// ────────────────────────────────────────────────────────────────────

describe('resolveContinueAction — enumeration guard (the three non-passkey branches)', () => {
  it('account-exists (no passkey) → { kind: "magic-link" } + MagicLinkSignInEmail', async () => {
    hoisted.rpcMock.mockResolvedValueOnce({ data: 'user-1', error: null });
    hoisted.passkeyCountMock.mockResolvedValueOnce({ count: 0, error: null });

    const result = await resolveContinueAction('match@example.com');

    expect(result).toEqual({ kind: 'magic-link' });
    expect(hoisted.sendMagicLinkSignInMock).toHaveBeenCalledTimes(1);
    expect(hoisted.sendGhostClaimEmailMock).not.toHaveBeenCalled();
    expect(hoisted.sendUnknownEmailSignupEmailMock).not.toHaveBeenCalled();
    expect(hoisted.delayToFloorMock).toHaveBeenCalledTimes(1);
  });

  it('ghost-match only → { kind: "magic-link" } + GhostClaimEmail', async () => {
    // No auth user, but a ghost.
    hoisted.rpcMock.mockResolvedValueOnce({ data: null, error: null });
    hoisted.ghostLookupMock.mockResolvedValueOnce({
      data: { id: 'ghost-1' },
      error: null,
    });

    const result = await resolveContinueAction('ghost@example.com');

    expect(result).toEqual({ kind: 'magic-link' });
    expect(hoisted.sendGhostClaimEmailMock).toHaveBeenCalledTimes(1);
    expect(hoisted.sendMagicLinkSignInMock).not.toHaveBeenCalled();
    expect(hoisted.sendUnknownEmailSignupEmailMock).not.toHaveBeenCalled();
  });

  it('unknown → { kind: "magic-link" } + UnknownEmailSignupEmail', async () => {
    const result = await resolveContinueAction('unknown@example.com');

    expect(result).toEqual({ kind: 'magic-link' });
    expect(hoisted.sendUnknownEmailSignupEmailMock).toHaveBeenCalledTimes(1);
    expect(hoisted.sendMagicLinkSignInMock).not.toHaveBeenCalled();
    expect(hoisted.sendGhostClaimEmailMock).not.toHaveBeenCalled();
  });

  it('all three non-passkey branches produce an identical caller-visible response', async () => {
    // Branch 1: account-exists.
    hoisted.rpcMock.mockResolvedValueOnce({ data: 'user-1', error: null });
    hoisted.passkeyCountMock.mockResolvedValueOnce({ count: 0, error: null });
    const a = await resolveContinueAction('a@example.com');

    // Branch 2: ghost-only.
    hoisted.rpcMock.mockResolvedValueOnce({ data: null, error: null });
    hoisted.ghostLookupMock.mockResolvedValueOnce({
      data: { id: 'ghost-1' },
      error: null,
    });
    const b = await resolveContinueAction('b@example.com');

    // Branch 3: unknown.
    const c = await resolveContinueAction('c@example.com');

    // EXACT-EQUALITY is the test — any schema drift on any branch
    // breaks the enumeration guard.
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a).toEqual({ kind: 'magic-link' });
  });
});

describe('resolveContinueAction — passkey branch', () => {
  it('passkey on file → { kind: "passkey" }, no email sent', async () => {
    hoisted.rpcMock.mockResolvedValueOnce({ data: 'user-with-passkey', error: null });
    hoisted.passkeyCountMock.mockResolvedValueOnce({ count: 2, error: null });

    const result = await resolveContinueAction('passkey@example.com');

    expect(result).toEqual({ kind: 'passkey' });
    expect(hoisted.sendMagicLinkSignInMock).not.toHaveBeenCalled();
    expect(hoisted.sendGhostClaimEmailMock).not.toHaveBeenCalled();
    expect(hoisted.sendUnknownEmailSignupEmailMock).not.toHaveBeenCalled();
    // Passkey branch skips the jitter floor — the WebAuthn client-side
    // latency dominates user-perceived wall time.
    expect(hoisted.delayToFloorMock).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// Enumeration-guard invariants
// ────────────────────────────────────────────────────────────────────

describe('resolveContinueAction — dummy compare runs regardless of branch', () => {
  it('dummy compare fires on the passkey branch', async () => {
    hoisted.rpcMock.mockResolvedValueOnce({ data: 'user-1', error: null });
    hoisted.passkeyCountMock.mockResolvedValueOnce({ count: 1, error: null });
    await resolveContinueAction('pk@example.com');
    expect(hoisted.dummyCompareMock).toHaveBeenCalledTimes(1);
  });

  it('dummy compare fires on the unknown branch', async () => {
    await resolveContinueAction('x@example.com');
    expect(hoisted.dummyCompareMock).toHaveBeenCalledTimes(1);
  });

  it('dummy compare fires on the ghost branch', async () => {
    hoisted.ghostLookupMock.mockResolvedValueOnce({
      data: { id: 'ghost-1' },
      error: null,
    });
    await resolveContinueAction('g@example.com');
    expect(hoisted.dummyCompareMock).toHaveBeenCalledTimes(1);
  });

  it('dummy compare does NOT fire on malformed input (short-circuit is legal there)', async () => {
    const result = await resolveContinueAction('not-an-email');
    expect(result).toEqual({ kind: 'unknown' });
    expect(hoisted.dummyCompareMock).not.toHaveBeenCalled();
  });
});

describe('resolveContinueAction — always-lookup invariant', () => {
  it('account-exists still probes the ghost table (parallel lookup)', async () => {
    hoisted.rpcMock.mockResolvedValueOnce({ data: 'user-1', error: null });
    hoisted.passkeyCountMock.mockResolvedValueOnce({ count: 0, error: null });
    await resolveContinueAction('both@example.com');

    // Ghost lookup is called even though the auth user resolved first.
    expect(hoisted.ghostLookupMock).toHaveBeenCalledTimes(1);
    // Auth user resolution RPC is called.
    expect(hoisted.rpcMock).toHaveBeenCalledWith(
      'get_user_id_by_email',
      expect.objectContaining({ user_email: 'both@example.com' }),
    );
  });
});

describe('resolveContinueAction — rate limiting', () => {
  it('rate-limited press returns { kind: "magic-link" } (no branch leak)', async () => {
    // 5 allowed for the email bucket, 6th is throttled.
    for (let i = 0; i < 5; i++) {
      const ok = await resolveContinueAction('burst@example.com');
      expect(ok.kind).toBe('magic-link');
    }
    const throttled = await resolveContinueAction('burst@example.com');
    // CRITICAL: same shape as allowed response.
    expect(throttled).toEqual({ kind: 'magic-link' });

    // The floor is still enforced on throttled presses.
    expect(hoisted.delayToFloorMock).toHaveBeenCalled();
  });
});

describe('resolveContinueAction — ghost-match telemetry', () => {
  it('emits ghost_match_on_signin only when a ghost matched', async () => {
    // Ghost branch.
    hoisted.ghostLookupMock.mockResolvedValueOnce({
      data: { id: 'ghost-1' },
      error: null,
    });
    await resolveContinueAction('ghost-tel@example.com');

    const events = hoisted.consoleLogSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((v: unknown): v is string => typeof v === 'string')
      .map((s: string) => {
        try {
          return JSON.parse(s) as { event?: string };
        } catch {
          return {};
        }
      });
    const hasGhostEvent = events.some(
      (e) => e?.event === 'ghost_match_on_signin',
    );
    expect(hasGhostEvent).toBe(true);
  });

  it('does NOT emit ghost_match_on_signin on the unknown branch', async () => {
    await resolveContinueAction('nothing-here@example.com');
    const events = hoisted.consoleLogSpy.mock.calls
      .map((c: unknown[]) => c[0])
      .filter((v: unknown): v is string => typeof v === 'string')
      .map((s: string) => {
        try {
          return JSON.parse(s) as { event?: string };
        } catch {
          return {};
        }
      });
    expect(events.every((e) => e?.event !== 'ghost_match_on_signin')).toBe(
      true,
    );
  });
});

describe('resolveContinueAction — validation short-circuit', () => {
  it('malformed email returns { kind: "unknown" } without lookup or email', async () => {
    const result = await resolveContinueAction('not an email');
    expect(result).toEqual({ kind: 'unknown' });
    expect(hoisted.fetchMock).not.toHaveBeenCalled();
    expect(hoisted.ghostLookupMock).not.toHaveBeenCalled();
    expect(hoisted.sendMagicLinkSignInMock).not.toHaveBeenCalled();
    expect(hoisted.sendGhostClaimEmailMock).not.toHaveBeenCalled();
    expect(hoisted.sendUnknownEmailSignupEmailMock).not.toHaveBeenCalled();
  });
});

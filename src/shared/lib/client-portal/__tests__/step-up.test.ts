/**
 * Step-up sliding-window tests.
 *
 * Pins the "10 adds → 1 prompt" invariant from Songs design doc §0 A6
 * and §14 step-up enforcement contract. If any of these fail, the
 * client portal Songs page will fire multiple OTP prompts during a
 * normal list-building session and couples will rage-quit.
 *
 * Strategy: mock `./cookies` with an in-memory fake cookie jar so the
 * tests exercise the real `requireStepUp()` control flow end-to-end
 * without needing a Next.js route-handler context.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared in-memory cookie state across mocked read/write/clear.
// Reset in beforeEach.
let fakeClaim: { stepUpUntil: Date; stepUpMethod: 'otp' | 'passkey' } | null = null;
const writeLog: Array<{ at: number; method: 'otp' | 'passkey'; until: number }> = [];

vi.mock('../cookies', async () => {
  const actual = await vi.importActual<typeof import('../cookies')>('../cookies');
  return {
    ...actual,
    readStepUpCookie: vi.fn(async () => fakeClaim),
    setStepUpCookie: vi.fn(async (method: 'otp' | 'passkey') => {
      const until = Date.now() + actual.CLIENT_PORTAL_STEP_UP_TTL_SECONDS * 1000;
      fakeClaim = { stepUpUntil: new Date(until), stepUpMethod: method };
      writeLog.push({ at: Date.now(), method, until });
    }),
    clearStepUpCookie: vi.fn(async () => {
      fakeClaim = null;
    }),
  };
});

import { requireStepUp } from '../step-up';
import { CLIENT_PORTAL_STEP_UP_TTL_SECONDS } from '../cookies';

const MINUTE = 60 * 1000;

beforeEach(() => {
  fakeClaim = null;
  writeLog.length = 0;
  vi.useRealTimers();
});

describe('requireStepUp — basic gating', () => {
  it('denies with reason=missing when no cookie is present', async () => {
    const result = await requireStepUp();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('missing');
      expect(result.required).toBe('any');
    }
  });

  it('denies with reason=expired when the cookie is past its expiry', async () => {
    fakeClaim = {
      stepUpUntil: new Date(Date.now() - 1 * MINUTE),
      stepUpMethod: 'otp',
    };
    const result = await requireStepUp();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('expired');
  });

  it('denies with reason=wrong_method when requireMethod mismatches', async () => {
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 10 * MINUTE),
      stepUpMethod: 'otp',
    };
    const result = await requireStepUp({ requireMethod: 'passkey' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('wrong_method');
      expect(result.required).toBe('passkey');
    }
  });

  it('approves when the claim is fresh and passes all checks', async () => {
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 10 * MINUTE),
      stepUpMethod: 'otp',
    };
    const result = await requireStepUp();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.method).toBe('otp');
      expect(result.expiresAt).toBeInstanceOf(Date);
    }
  });
});

describe('requireStepUp — sliding refresh (§0 A6)', () => {
  it('refreshes the cookie on every successful check', async () => {
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 5 * MINUTE),
      stepUpMethod: 'otp',
    };
    await requireStepUp();
    expect(writeLog).toHaveLength(1);
    await requireStepUp();
    expect(writeLog).toHaveLength(2);
    await requireStepUp();
    expect(writeLog).toHaveLength(3);
  });

  it('"10 adds → 1 prompt" — 10 rapid successful checks never re-prompt', async () => {
    // Simulates Maya sitting down and adding 10 songs in 2 minutes. An
    // initial OTP stepped her up; she should NEVER hit 'expired' during
    // this burst, even though each call reads (and refreshes) the cookie.
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + CLIENT_PORTAL_STEP_UP_TTL_SECONDS * 1000),
      stepUpMethod: 'otp',
    };

    for (let i = 0; i < 10; i++) {
      const result = await requireStepUp();
      expect(result.ok).toBe(true);
    }

    // Exactly 10 refreshes. No "initial" set — that would be the OTP
    // verification flow writing the cookie BEFORE the first requireStepUp
    // call, which is out of scope for this test.
    expect(writeLog).toHaveLength(10);
  });

  it('extends the expiry forward by a full TTL on each successful call', async () => {
    // Start with a claim that has only 2 minutes left.
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 2 * MINUTE),
      stepUpMethod: 'otp',
    };

    const before = fakeClaim.stepUpUntil.getTime();
    const result = await requireStepUp();
    expect(result.ok).toBe(true);

    // After the refresh the stored expiry should be ≥ now + 29 minutes
    // (allowing for a tiny scheduler drift). That's the proof of the
    // sliding behavior: a 2-minute-left claim becomes a 30-minute claim
    // simply by being observed.
    const after = fakeClaim!.stepUpUntil.getTime();
    expect(after).toBeGreaterThan(before);
    expect(after - Date.now()).toBeGreaterThanOrEqual(29 * MINUTE);
    expect(after - Date.now()).toBeLessThanOrEqual(31 * MINUTE);
  });

  it('returns the post-slide expiry on the approval object', async () => {
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 2 * MINUTE),
      stepUpMethod: 'otp',
    };
    const result = await requireStepUp();
    expect(result.ok).toBe(true);
    if (result.ok) {
      // The approval.expiresAt must reflect the post-slide window, not
      // the pre-slide 2-minute claim — otherwise callers would display
      // a stale "you have 2 minutes left" banner while the cookie is
      // actually good for 30.
      const msLeft = result.expiresAt.getTime() - Date.now();
      expect(msLeft).toBeGreaterThanOrEqual(29 * MINUTE);
    }
  });

  it('does NOT refresh on denial paths (missing, expired, wrong_method)', async () => {
    // missing
    fakeClaim = null;
    await requireStepUp();
    expect(writeLog).toHaveLength(0);

    // expired
    fakeClaim = {
      stepUpUntil: new Date(Date.now() - 1 * MINUTE),
      stepUpMethod: 'otp',
    };
    await requireStepUp();
    // readStepUpCookie (in the real implementation) would return null
    // for a past expiry, but our mock doesn't short-circuit — so the
    // step-up check itself has to reject. Either way, no write.
    expect(writeLog).toHaveLength(0);

    // wrong_method
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 10 * MINUTE),
      stepUpMethod: 'otp',
    };
    await requireStepUp({ requireMethod: 'passkey' });
    expect(writeLog).toHaveLength(0);
  });

  it('skips the refresh when slide: false is passed explicitly', async () => {
    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 10 * MINUTE),
      stepUpMethod: 'otp',
    };
    const result = await requireStepUp({ slide: false });
    expect(result.ok).toBe(true);
    expect(writeLog).toHaveLength(0);

    if (result.ok) {
      // expiresAt should be the ORIGINAL claim's expiry, not a
      // post-slide time — callers that opted out of the slide are
      // explicitly asking for "what is the current state" semantics.
      const msLeft = result.expiresAt.getTime() - Date.now();
      expect(msLeft).toBeLessThanOrEqual(10 * MINUTE + 10);
    }
  });

  it('silently no-ops the refresh if setStepUpCookie throws (server component context)', async () => {
    const { setStepUpCookie } = await import('../cookies');
    vi.mocked(setStepUpCookie).mockRejectedValueOnce(
      new Error('Cookies can only be modified in a Server Action or Route Handler.'),
    );

    fakeClaim = {
      stepUpUntil: new Date(Date.now() + 10 * MINUTE),
      stepUpMethod: 'otp',
    };
    const result = await requireStepUp();

    // The check still approves — the original claim is still valid.
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.method).toBe('otp');
  });
});

describe('requireStepUp — TTL constant sanity', () => {
  it('CLIENT_PORTAL_STEP_UP_TTL_SECONDS is 30 minutes (A6)', () => {
    // Regression guard for the 2026-04-10 15→30 minute bump. If someone
    // drops this back to 15 minutes the couple-facing UX craters; this
    // test pins the decision and this comment is the rationale.
    expect(CLIENT_PORTAL_STEP_UP_TTL_SECONDS).toBe(30 * 60);
  });
});

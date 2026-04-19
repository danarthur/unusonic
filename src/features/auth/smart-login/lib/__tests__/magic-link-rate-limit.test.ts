/**
 * Unit tests for the Phase 2 in-memory magic-link rate limiter.
 *
 * Covers the three semantics that matter at the boundary:
 *   - Within-window caps trip at exactly `limit + 1`.
 *   - Expiry past the sliding window resets the bucket.
 *   - IP bucket and email bucket are independent (a common IP doesn't
 *     shield a per-email abuser and vice versa).
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  checkMagicLinkRateLimit,
  __resetMagicLinkRateLimitStore,
  MAGIC_LINK_RATE_LIMIT_DEFAULTS,
} from '../magic-link-rate-limit';

beforeEach(() => {
  __resetMagicLinkRateLimitStore();
});

describe('checkMagicLinkRateLimit — happy path', () => {
  it('allows the first call and records it', () => {
    const r = checkMagicLinkRateLimit(
      { ip: '1.2.3.4', emailHash: 'hash-a' },
      { now: () => 1_000 },
    );
    expect(r.allowed).toBe(true);
  });

  it('throws on empty emailHash (programmer error)', () => {
    expect(() =>
      checkMagicLinkRateLimit({ ip: '1.2.3.4', emailHash: '' }),
    ).toThrow(/emailHash/);
  });
});

describe('checkMagicLinkRateLimit — email bucket', () => {
  it('trips on send #6 for the same emailHash within the window', () => {
    let now = 1_000;
    for (let i = 0; i < 5; i++) {
      const r = checkMagicLinkRateLimit(
        { ip: `ip-${i}`, emailHash: 'target' },
        { now: () => now },
      );
      expect(r.allowed).toBe(true);
      now += 1_000; // well inside the 60s window
    }

    const blocked = checkMagicLinkRateLimit(
      { ip: 'ip-fresh', emailHash: 'target' },
      { now: () => now },
    );
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.scope).toBe('email');
      expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    }
  });

  it('allows again once the window has slid past the oldest entry', () => {
    // Saturate at t=1000 with 5 sends and assert the 6th is blocked.
    const baseTime = 1_000;
    for (let i = 0; i < 5; i++) {
      checkMagicLinkRateLimit(
        { ip: null, emailHash: 'target' },
        { now: () => baseTime },
      );
    }
    const blocked = checkMagicLinkRateLimit(
      { ip: null, emailHash: 'target' },
      { now: () => baseTime },
    );
    expect(blocked.allowed).toBe(false);

    // Slide past the window — window default is 60s.
    const future = baseTime + MAGIC_LINK_RATE_LIMIT_DEFAULTS.windowMs + 1;
    const ok = checkMagicLinkRateLimit(
      { ip: null, emailHash: 'target' },
      { now: () => future },
    );
    expect(ok.allowed).toBe(true);
  });
});

describe('checkMagicLinkRateLimit — ip bucket', () => {
  it('trips on send #11 for the same IP even across distinct emails', () => {
    let now = 1_000;
    for (let i = 0; i < 10; i++) {
      const r = checkMagicLinkRateLimit(
        { ip: '1.2.3.4', emailHash: `target-${i}` },
        { now: () => now },
      );
      expect(r.allowed).toBe(true);
      now += 100;
    }

    const blocked = checkMagicLinkRateLimit(
      { ip: '1.2.3.4', emailHash: 'target-fresh' },
      { now: () => now },
    );
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.scope).toBe('ip');
    }
  });

  it('null IP skips the IP bucket entirely (email bucket still applies)', () => {
    let now = 1_000;
    // 5 sends with null IP — limit is email=5, so the 6th trips on email.
    for (let i = 0; i < 5; i++) {
      const r = checkMagicLinkRateLimit(
        { ip: null, emailHash: 'target' },
        { now: () => now },
      );
      expect(r.allowed).toBe(true);
      now += 100;
    }
    const blocked = checkMagicLinkRateLimit(
      { ip: null, emailHash: 'target' },
      { now: () => now },
    );
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.scope).toBe('email');
    }
  });
});

describe('checkMagicLinkRateLimit — option overrides', () => {
  it('respects option-provided limits for dependency-injection', () => {
    const r1 = checkMagicLinkRateLimit(
      { ip: '1.2.3.4', emailHash: 'target' },
      { ipLimit: 1, emailLimit: 1, now: () => 1000 },
    );
    expect(r1.allowed).toBe(true);

    const r2 = checkMagicLinkRateLimit(
      { ip: '1.2.3.4', emailHash: 'target' },
      { ipLimit: 1, emailLimit: 1, now: () => 1001 },
    );
    expect(r2.allowed).toBe(false);
  });
});

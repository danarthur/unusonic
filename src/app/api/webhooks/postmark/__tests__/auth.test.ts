/**
 * Basic Auth verification tests — constant-length padding + timing safety.
 *
 * Closes the length side-channel from the pre-hardening timingSafeEqual
 * implementation that threw on length mismatch (Explore agent Critical #2,
 * 2026-04-24 audit).
 *
 * @module app/api/webhooks/postmark/__tests__/auth
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyBasicAuth } from '../__lib__/auth';

const ORIGINAL_ENV = { ...process.env };
const USERNAME = 'postmark-test-user';
const PASSWORD = 'ULTRA-long-random-password-1234567890abcdef';

beforeEach(() => {
  process.env.POSTMARK_WEBHOOK_USERNAME = USERNAME;
  process.env.POSTMARK_WEBHOOK_PASSWORD = PASSWORD;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

const makeHeader = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`, 'utf-8').toString('base64')}`;

describe('verifyBasicAuth — happy path', () => {
  it('accepts exact credentials', () => {
    expect(verifyBasicAuth(makeHeader(USERNAME, PASSWORD))).toEqual({ ok: true });
  });

  it('accepts credentials with colon characters in the password', () => {
    process.env.POSTMARK_WEBHOOK_PASSWORD = 'pass:with:colons';
    expect(verifyBasicAuth(makeHeader(USERNAME, 'pass:with:colons'))).toEqual({ ok: true });
  });
});

describe('verifyBasicAuth — env-missing failure mode', () => {
  it('rejects when username env is unset', () => {
    delete process.env.POSTMARK_WEBHOOK_USERNAME;
    expect(verifyBasicAuth(makeHeader(USERNAME, PASSWORD))).toEqual({
      ok: false,
      reason: 'env-missing',
    });
  });

  it('rejects when password env is unset', () => {
    delete process.env.POSTMARK_WEBHOOK_PASSWORD;
    expect(verifyBasicAuth(makeHeader(USERNAME, PASSWORD))).toEqual({
      ok: false,
      reason: 'env-missing',
    });
  });

  it('rejects when env is empty string (never accept open access)', () => {
    process.env.POSTMARK_WEBHOOK_PASSWORD = '';
    expect(verifyBasicAuth(makeHeader(USERNAME, ''))).toEqual({
      ok: false,
      reason: 'env-missing',
    });
  });
});

describe('verifyBasicAuth — header-missing failure mode', () => {
  it('rejects a missing Authorization header', () => {
    expect(verifyBasicAuth(null)).toEqual({
      ok: false,
      reason: 'header-missing',
    });
  });

  it('rejects a non-Basic scheme (Bearer)', () => {
    expect(verifyBasicAuth('Bearer sometoken')).toEqual({
      ok: false,
      reason: 'header-missing',
    });
  });

  it('rejects an empty header', () => {
    expect(verifyBasicAuth('')).toEqual({
      ok: false,
      reason: 'header-missing',
    });
  });

  it('accepts "Basic" in any case', () => {
    const header = makeHeader(USERNAME, PASSWORD).replace('Basic', 'BASIC');
    expect(verifyBasicAuth(header)).toEqual({ ok: true });
  });
});

describe('verifyBasicAuth — header-malformed failure mode', () => {
  it('rejects a non-base64 payload', () => {
    // Note: Buffer.from('not valid base64 !!!').toString('utf-8') produces
    // garbled bytes but not a throw. The sep=':' check is what actually
    // catches this — our payload decodes to something without a colon.
    const result = verifyBasicAuth('Basic notvalidbase64butpadded');
    expect(result.ok).toBe(false);
    // Either header-malformed or credential-mismatch is acceptable; we
    // assert it's one of the two, not passing.
    expect(['header-malformed', 'credential-mismatch']).toContain(
      (result as { ok: false; reason: string }).reason,
    );
  });

  it('rejects payload with no colon separator', () => {
    const payload = Buffer.from('nocolonhere', 'utf-8').toString('base64');
    expect(verifyBasicAuth(`Basic ${payload}`)).toEqual({
      ok: false,
      reason: 'header-malformed',
    });
  });
});

describe('verifyBasicAuth — credential-mismatch failure mode (timing-safe)', () => {
  it('rejects wrong password with correct username', () => {
    const result = verifyBasicAuth(makeHeader(USERNAME, 'wrong-password'));
    expect(result).toEqual({ ok: false, reason: 'credential-mismatch' });
  });

  it('rejects wrong username with correct password', () => {
    const result = verifyBasicAuth(makeHeader('wrong-user', PASSWORD));
    expect(result).toEqual({ ok: false, reason: 'credential-mismatch' });
  });

  it('rejects credentials of very different lengths (no throw, no leak)', () => {
    // The pre-hardening bug: timingSafeEqual throws on length mismatch.
    // The padded implementation MUST NOT throw and MUST return a clean
    // false.
    expect(() => {
      const result = verifyBasicAuth(makeHeader('a', 'b'));
      expect(result.ok).toBe(false);
      expect((result as { ok: false; reason: string }).reason).toBe('credential-mismatch');
    }).not.toThrow();
  });

  it('rejects credentials longer than the pad target (64 bytes)', () => {
    const longUser = 'u'.repeat(200);
    const longPass = 'p'.repeat(300);
    const result = verifyBasicAuth(makeHeader(longUser, longPass));
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toBe('credential-mismatch');
  });

  it('rejects empty user and password in the header', () => {
    const result = verifyBasicAuth(makeHeader('', ''));
    expect(result.ok).toBe(false);
  });

  it('rejects credentials that differ only in length (length leak guard)', () => {
    // Same prefix, different length — pre-hardening this leaked length
    // via throw→catch timing. Padded impl treats as not-equal cleanly.
    const correct = USERNAME;
    const tooShort = correct.slice(0, 3);
    const result = verifyBasicAuth(makeHeader(tooShort, PASSWORD));
    expect(result.ok).toBe(false);
  });
});

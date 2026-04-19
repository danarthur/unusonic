/**
 * Tests for the salted email hash helper.
 *
 * Verifies:
 *   - Output is deterministic per (salt, email).
 *   - Raw email strings are never present in the output.
 *   - Email casing and surrounding whitespace are normalized.
 *   - Salt presence flips the output.
 *   - A missing salt falls back to the dev marker + warning, exactly once.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DEV_SALT_FALLBACK,
  __resetDevWarningForTests,
  hashEmailForTelemetry,
} from '../hash-email-for-telemetry';

describe('hashEmailForTelemetry', () => {
  beforeEach(() => {
    __resetDevWarningForTests();
  });

  it('is deterministic for the same salt + email', () => {
    const env = { AUTH_TELEMETRY_SALT: 'fixed-salt' };
    const a = hashEmailForTelemetry('user@example.com', env);
    const b = hashEmailForTelemetry('user@example.com', env);
    expect(a).toEqual(b);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('normalizes casing and surrounding whitespace', () => {
    const env = { AUTH_TELEMETRY_SALT: 'fixed-salt' };
    expect(hashEmailForTelemetry('User@Example.com', env)).toEqual(
      hashEmailForTelemetry('user@example.com', env),
    );
    expect(hashEmailForTelemetry('  USER@EXAMPLE.COM  ', env)).toEqual(
      hashEmailForTelemetry('user@example.com', env),
    );
  });

  it('preserves plus-addressing as distinct', () => {
    const env = { AUTH_TELEMETRY_SALT: 'fixed-salt' };
    expect(hashEmailForTelemetry('foo+bar@example.com', env)).not.toEqual(
      hashEmailForTelemetry('foo@example.com', env),
    );
  });

  it('never includes the raw email in the output', () => {
    const env = { AUTH_TELEMETRY_SALT: 'fixed-salt' };
    const email = 'private.user+secret@example.com';
    const hash = hashEmailForTelemetry(email, env);
    expect(hash).not.toContain('private');
    expect(hash).not.toContain('example');
    expect(hash).not.toContain('secret');
    expect(hash).not.toContain('@');
  });

  it('produces different hashes for different salts', () => {
    const a = hashEmailForTelemetry('user@example.com', { AUTH_TELEMETRY_SALT: 'salt-a' });
    const b = hashEmailForTelemetry('user@example.com', { AUTH_TELEMETRY_SALT: 'salt-b' });
    expect(a).not.toEqual(b);
  });

  it('returns an empty string for an empty email input', () => {
    expect(hashEmailForTelemetry('', { AUTH_TELEMETRY_SALT: 'salt' })).toBe('');
    expect(hashEmailForTelemetry('   ', { AUTH_TELEMETRY_SALT: 'salt' })).toBe('');
  });

  it('returns an empty string for non-string inputs', () => {
    expect(hashEmailForTelemetry(undefined as unknown as string, { AUTH_TELEMETRY_SALT: 'salt' })).toBe(
      '',
    );
    expect(hashEmailForTelemetry(null as unknown as string, { AUTH_TELEMETRY_SALT: 'salt' })).toBe('');
  });

  describe('missing salt fallback', () => {
    it('warns once on stderr and uses the dev fallback when salt is unset', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const first = hashEmailForTelemetry('user@example.com', {});
      const second = hashEmailForTelemetry('other@example.com', {});

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain('AUTH_TELEMETRY_SALT');

      // The fallback salt produces deterministic output we can verify
      // by running an equivalent hash with the fallback salt explicitly.
      const expected = hashEmailForTelemetry('user@example.com', {
        AUTH_TELEMETRY_SALT: DEV_SALT_FALLBACK,
      });
      expect(first).toEqual(expected);
      // Also confirm the second call used the same fallback path
      // (different email => different hash, still deterministic).
      const expectedSecond = hashEmailForTelemetry('other@example.com', {
        AUTH_TELEMETRY_SALT: DEV_SALT_FALLBACK,
      });
      expect(second).toEqual(expectedSecond);

      warn.mockRestore();
    });
  });
});

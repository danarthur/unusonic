/**
 * Unit tests for the env-based auth flag reader.
 *
 * Phase 0 de-risk layer. Verifies:
 *   - Every flag defaults to OFF when env is empty or the value is
 *     missing/malformed.
 *   - Only the narrow allowlist of truthy string values flips a flag
 *     ON; everything else stays OFF.
 *   - The snapshot helper returns a stable object keyed by all known
 *     flags.
 */

import { describe, it, expect } from 'vitest';

import {
  AUTH_FLAGS,
  getAuthFlag,
  getAuthFlagsSnapshot,
  type AuthFlagKey,
} from '../auth-flags';

describe('getAuthFlag — defaults', () => {
  it('returns false for every known flag in an empty env', () => {
    const env = {};
    for (const flag of Object.values(AUTH_FLAGS)) {
      expect(getAuthFlag(flag, env)).toBe(false);
    }
  });

  it('returns false when the env var is undefined', () => {
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_LOGIN_CARD, { AUTH_V2_LOGIN_CARD: undefined })).toBe(false);
  });

  it('returns false when the env var is the empty string', () => {
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_LOGIN_CARD, { AUTH_V2_LOGIN_CARD: '' })).toBe(false);
  });

  it('returns false when the env var is only whitespace', () => {
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_LOGIN_CARD, { AUTH_V2_LOGIN_CARD: '   ' })).toBe(false);
  });
});

describe('getAuthFlag — truthy values', () => {
  const truthyValues = ['1', 'true', 'TRUE', 'True', 'on', 'ON', 'yes', 'YES', 'Yes'];

  for (const value of truthyValues) {
    it(`returns true for "${value}"`, () => {
      expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_LOGIN_CARD, { AUTH_V2_LOGIN_CARD: value })).toBe(true);
    });
  }

  it('respects surrounding whitespace', () => {
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_SMS, { AUTH_V2_SMS: '  true  ' })).toBe(true);
  });
});

describe('getAuthFlag — malformed / falsy values', () => {
  const falsyValues = ['0', 'false', 'FALSE', 'no', 'off', 'disabled', 'null', 'undefined', 'junk', 'enable me'];

  for (const value of falsyValues) {
    it(`returns false for "${value}"`, () => {
      expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_GUARDIAN_GATE, { AUTH_V2_GUARDIAN_GATE: value })).toBe(false);
    });
  }

  it('does not leak truthiness across flag names', () => {
    // Turning one flag ON must not affect another.
    const env = { AUTH_V2_LOGIN_CARD: 'true' };
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_LOGIN_CARD, env)).toBe(true);
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_SMS, env)).toBe(false);
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_GUARDIAN_GATE, env)).toBe(false);
    expect(getAuthFlag(AUTH_FLAGS.AUTH_V2_MAGIC_LINK_REPLACES_OTP, env)).toBe(false);
  });
});

describe('getAuthFlagsSnapshot', () => {
  it('returns an object with every known flag as a key', () => {
    const snapshot = getAuthFlagsSnapshot({});
    const expectedKeys = Object.values(AUTH_FLAGS).sort();
    expect(Object.keys(snapshot).sort()).toEqual(expectedKeys);
  });

  it('reflects the env state per flag', () => {
    const env = {
      AUTH_V2_LOGIN_CARD: 'true',
      AUTH_V2_SMS: '1',
      AUTH_V2_GUARDIAN_GATE: 'false',
      // AUTH_V2_MAGIC_LINK_REPLACES_OTP deliberately unset
    };
    const snapshot = getAuthFlagsSnapshot(env);
    expect(snapshot.AUTH_V2_LOGIN_CARD).toBe(true);
    expect(snapshot.AUTH_V2_SMS).toBe(true);
    expect(snapshot.AUTH_V2_GUARDIAN_GATE).toBe(false);
    expect(snapshot.AUTH_V2_MAGIC_LINK_REPLACES_OTP).toBe(false);
  });

  it('defaults every flag to false given an empty env', () => {
    const snapshot = getAuthFlagsSnapshot({});
    for (const value of Object.values(snapshot)) {
      expect(value).toBe(false);
    }
  });

  it('snapshot is JSON-serializable', () => {
    const snapshot = getAuthFlagsSnapshot({ AUTH_V2_LOGIN_CARD: '1' });
    expect(() => JSON.stringify(snapshot)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(snapshot)) as Record<AuthFlagKey, boolean>;
    expect(parsed.AUTH_V2_LOGIN_CARD).toBe(true);
  });
});

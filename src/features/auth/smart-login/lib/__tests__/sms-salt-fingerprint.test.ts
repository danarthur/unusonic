/**
 * Tests for the SMS salt fingerprint parity helper.
 * @module features/auth/smart-login/lib/sms-salt-fingerprint.test
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertSmsOtpSaltConfigured,
  getSmsOtpSaltFingerprint,
} from '../sms-salt-fingerprint';

const ORIGINAL_SALT = process.env.SMS_OTP_HASH_SALT;

describe('getSmsOtpSaltFingerprint', () => {
  afterEach(() => {
    if (ORIGINAL_SALT === undefined) delete process.env.SMS_OTP_HASH_SALT;
    else process.env.SMS_OTP_HASH_SALT = ORIGINAL_SALT;
  });

  it('returns null when salt is missing', () => {
    delete process.env.SMS_OTP_HASH_SALT;
    expect(getSmsOtpSaltFingerprint()).toBeNull();
  });

  it('returns null when salt is empty string', () => {
    process.env.SMS_OTP_HASH_SALT = '';
    expect(getSmsOtpSaltFingerprint()).toBeNull();
  });

  it('is deterministic — same salt produces same fingerprint', () => {
    process.env.SMS_OTP_HASH_SALT = 'some-long-salt-value-abcdefghij';
    const a = getSmsOtpSaltFingerprint();
    const b = getSmsOtpSaltFingerprint();
    expect(a).toBe(b);
  });

  it('different salts produce different fingerprints', () => {
    process.env.SMS_OTP_HASH_SALT = 'salt-value-one-aaaaaaaaaaaa';
    const a = getSmsOtpSaltFingerprint();
    process.env.SMS_OTP_HASH_SALT = 'salt-value-two-bbbbbbbbbbbb';
    const b = getSmsOtpSaltFingerprint();
    expect(a).not.toBe(b);
  });

  it('returns a 16-char hex string', () => {
    process.env.SMS_OTP_HASH_SALT = 'a-proper-length-salt-abcdefghij';
    const fp = getSmsOtpSaltFingerprint();
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
  });

  it('does NOT reveal the salt directly', () => {
    const salt = 'secret-salt-abcdefghij';
    process.env.SMS_OTP_HASH_SALT = salt;
    const fp = getSmsOtpSaltFingerprint()!;
    expect(fp).not.toContain(salt);
  });
});

describe('assertSmsOtpSaltConfigured', () => {
  afterEach(() => {
    if (ORIGINAL_SALT === undefined) delete process.env.SMS_OTP_HASH_SALT;
    else process.env.SMS_OTP_HASH_SALT = ORIGINAL_SALT;
  });

  it('throws when salt is missing', () => {
    delete process.env.SMS_OTP_HASH_SALT;
    expect(() => assertSmsOtpSaltConfigured()).toThrow(/SMS_OTP_HASH_SALT/);
  });

  it('throws when salt is shorter than 16 chars', () => {
    process.env.SMS_OTP_HASH_SALT = 'too-short';
    expect(() => assertSmsOtpSaltConfigured()).toThrow(/too short/);
  });

  it('does not throw for a proper-length salt', () => {
    process.env.SMS_OTP_HASH_SALT = 'a-proper-length-salt-abcdefghij';
    expect(() => assertSmsOtpSaltConfigured()).not.toThrow();
  });
});

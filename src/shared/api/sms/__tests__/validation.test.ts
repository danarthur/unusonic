/**
 * Tests for SMS core utilities — phone normalization + recipient-kind
 * detection. The validation runs both server-side (action input) and
 * client-side (dialog UI hints), so it has to behave identically in
 * both contexts.
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePhoneE164,
  looksLikeEmail,
  detectRecipientKind,
} from '../validation';

describe('normalizePhoneE164', () => {
  it('accepts valid E.164', () => {
    expect(normalizePhoneE164('+15551234567')).toBe('+15551234567');
    expect(normalizePhoneE164('+447911123456')).toBe('+447911123456');
  });

  it('rejects an empty string', () => {
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164('   ')).toBeNull();
  });

  it('infers US country code from 10-digit input', () => {
    expect(normalizePhoneE164('5551234567')).toBe('+15551234567');
  });

  it('strips US 1-prefix from 11-digit input', () => {
    expect(normalizePhoneE164('15551234567')).toBe('+15551234567');
    expect(normalizePhoneE164('1-555-123-4567')).toBe('+15551234567');
  });

  it('normalizes formatted US numbers', () => {
    expect(normalizePhoneE164('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhoneE164('555.123.4567')).toBe('+15551234567');
    expect(normalizePhoneE164('555 123 4567')).toBe('+15551234567');
  });

  it('rejects non-phone text', () => {
    expect(normalizePhoneE164('not a phone')).toBeNull();
    expect(normalizePhoneE164('mike@example.com')).toBeNull();
  });

  it('rejects strings that look like phones but fail E.164', () => {
    expect(normalizePhoneE164('+0555')).toBeNull(); // can't start with 0 after +
    expect(normalizePhoneE164('+1')).toBeNull(); // too short
    expect(normalizePhoneE164('123')).toBeNull(); // 3-digit
    expect(normalizePhoneE164('1234')).toBeNull(); // 4-digit
  });

  it('preserves already-correct E.164 with various country codes', () => {
    expect(normalizePhoneE164('+33612345678')).toBe('+33612345678'); // France
    expect(normalizePhoneE164('+819012345678')).toBe('+819012345678'); // Japan
  });
});

describe('looksLikeEmail', () => {
  it('accepts standard email shapes', () => {
    expect(looksLikeEmail('mike@example.com')).toBe(true);
    expect(looksLikeEmail('linda+sales@invisibletouchevents.com')).toBe(true);
  });

  it('rejects phone-like strings', () => {
    expect(looksLikeEmail('5551234567')).toBe(false);
    expect(looksLikeEmail('+15551234567')).toBe(false);
  });

  it('rejects malformed emails', () => {
    expect(looksLikeEmail('notanemail')).toBe(false);
    expect(looksLikeEmail('two@@signs.com')).toBe(false);
    expect(looksLikeEmail('@nolocal.com')).toBe(false);
    expect(looksLikeEmail('nodomain@')).toBe(false);
  });
});

describe('detectRecipientKind', () => {
  it('returns email kind with lowercased value', () => {
    const r = detectRecipientKind('Mike@Example.COM');
    expect(r.kind).toBe('email');
    if (r.kind === 'email') expect(r.value).toBe('mike@example.com');
  });

  it('returns sms kind with E.164 value', () => {
    const r = detectRecipientKind('555-123-4567');
    expect(r.kind).toBe('sms');
    if (r.kind === 'sms') expect(r.value).toBe('+15551234567');
  });

  it('returns invalid for empty input', () => {
    expect(detectRecipientKind('').kind).toBe('invalid');
  });

  it('returns invalid for non-email non-phone text', () => {
    expect(detectRecipientKind('not anything').kind).toBe('invalid');
  });

  it('disambiguates by @ symbol', () => {
    expect(detectRecipientKind('mike@example.com').kind).toBe('email');
    expect(detectRecipientKind('5551234567').kind).toBe('sms');
  });

  it('treats partial emails as invalid (not phone)', () => {
    // "5551234@" looks neither email-shape nor phone-shape — guard against
    // the "@ present means email regardless" edge case
    expect(detectRecipientKind('5551234@').kind).toBe('invalid');
  });
});

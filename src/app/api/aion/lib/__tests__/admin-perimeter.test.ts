/**
 * Wk 13 §3.10 — admin perimeter (AION_ADMIN_USER_IDS) helper coverage.
 *
 * Pure-function tests against process.env. Covers the fail-closed posture
 * (missing env, empty env, whitespace), the allowlist parse path (single,
 * comma-list, comma+whitespace), and the boolean output for present /
 * absent caller ids.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isAionAdmin, getAionAdminUserIds } from '../admin-perimeter';

const ENV_KEY = 'AION_ADMIN_USER_IDS';

describe('isAionAdmin — fail-closed posture', () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it('returns false when env var is missing entirely', () => {
    expect(isAionAdmin('11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('returns false when env var is set but empty', () => {
    process.env[ENV_KEY] = '';
    expect(isAionAdmin('11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('returns false when env var is whitespace-only', () => {
    process.env[ENV_KEY] = '   ,  ,';
    expect(isAionAdmin('11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('returns false for null/undefined caller id even when allowlist is populated', () => {
    process.env[ENV_KEY] = '11111111-1111-1111-1111-111111111111';
    expect(isAionAdmin(null)).toBe(false);
    expect(isAionAdmin(undefined)).toBe(false);
    expect(isAionAdmin('')).toBe(false);
  });
});

describe('isAionAdmin — allowlist matching', () => {
  let saved: string | undefined;

  beforeEach(() => { saved = process.env[ENV_KEY]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it('matches a single uuid env var', () => {
    process.env[ENV_KEY] = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(isAionAdmin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);
    expect(isAionAdmin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe(false);
  });

  it('matches any uuid in a comma-separated list', () => {
    process.env[ENV_KEY] = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    expect(isAionAdmin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);
    expect(isAionAdmin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe(true);
    expect(isAionAdmin('cccccccc-cccc-cccc-cccc-cccccccccccc')).toBe(false);
  });

  it('trims surrounding whitespace per entry', () => {
    process.env[ENV_KEY] = '  aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa , bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb  ';
    expect(isAionAdmin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);
    expect(isAionAdmin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe(true);
  });

  it('rotates without redeploy — re-reading env on each call', () => {
    process.env[ENV_KEY] = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    expect(isAionAdmin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(true);

    process.env[ENV_KEY] = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    expect(isAionAdmin('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')).toBe(false);
    expect(isAionAdmin('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')).toBe(true);
  });
});

describe('getAionAdminUserIds', () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env[ENV_KEY]; });
  afterEach(() => {
    if (saved === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = saved;
  });

  it('returns an empty Set when the env var is missing', () => {
    delete process.env[ENV_KEY];
    expect(getAionAdminUserIds().size).toBe(0);
  });

  it('returns an empty Set on whitespace-only env var', () => {
    process.env[ENV_KEY] = '  , ,';
    expect(getAionAdminUserIds().size).toBe(0);
  });

  it('returns the trimmed entries as a Set (deduped)', () => {
    process.env[ENV_KEY] = 'aaa, bbb , aaa';
    const set = getAionAdminUserIds();
    expect(set.size).toBe(2);
    expect(set.has('aaa')).toBe(true);
    expect(set.has('bbb')).toBe(true);
  });
});

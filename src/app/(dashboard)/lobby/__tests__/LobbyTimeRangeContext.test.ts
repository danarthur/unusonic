/**
 * Unit tests for resolveRange() — the pure date math in LobbyTimeRangeContext.
 *
 * These tests are deliberately TZ-anchored via the `now` parameter so they are
 * deterministic regardless of CI host TZ.
 */

import { describe, it, expect } from 'vitest';
import { resolveRange, parseRange, serializeRange } from '../LobbyTimeRangeContext';

// A fixed instant: 2026-04-14T18:00:00Z. Relevant local dates:
//   UTC:                 2026-04-14
//   America/New_York:    2026-04-14 (EDT, UTC-4)
//   America/Los_Angeles: 2026-04-14 (PDT, UTC-7)
//   Pacific/Auckland:    2026-04-15 (NZST, UTC+12)
const FIXED_NOW = new Date('2026-04-14T18:00:00Z');

describe('resolveRange', () => {
  it('this_month — returns first and last day of the current calendar month', () => {
    expect(resolveRange({ kind: 'this_month' }, 'UTC', FIXED_NOW)).toEqual({
      start: '2026-04-01',
      end: '2026-04-30',
    });
  });

  it('last_month — returns first and last day of the previous month', () => {
    expect(resolveRange({ kind: 'last_month' }, 'UTC', FIXED_NOW)).toEqual({
      start: '2026-03-01',
      end: '2026-03-31',
    });
  });

  it('last_month — crosses year boundary correctly (Jan → prev Dec)', () => {
    const jan = new Date('2026-01-05T12:00:00Z');
    expect(resolveRange({ kind: 'last_month' }, 'UTC', jan)).toEqual({
      start: '2025-12-01',
      end: '2025-12-31',
    });
  });

  it('this_quarter — returns the full current quarter (April → Q2)', () => {
    expect(resolveRange({ kind: 'this_quarter' }, 'UTC', FIXED_NOW)).toEqual({
      start: '2026-04-01',
      end: '2026-06-30',
    });
  });

  it('last_quarter — returns the full previous quarter (Q2 → Q1)', () => {
    expect(resolveRange({ kind: 'last_quarter' }, 'UTC', FIXED_NOW)).toEqual({
      start: '2026-01-01',
      end: '2026-03-31',
    });
  });

  it('last_quarter — crosses year boundary (Q1 → prev-year Q4)', () => {
    const feb = new Date('2026-02-10T12:00:00Z');
    expect(resolveRange({ kind: 'last_quarter' }, 'UTC', feb)).toEqual({
      start: '2025-10-01',
      end: '2025-12-31',
    });
  });

  it('ytd — returns Jan 1 → today (inclusive)', () => {
    expect(resolveRange({ kind: 'ytd' }, 'UTC', FIXED_NOW)).toEqual({
      start: '2026-01-01',
      end: '2026-04-14',
    });
  });

  it('last_30d — returns a 30-day inclusive window ending today', () => {
    const out = resolveRange({ kind: 'last_30d' }, 'UTC', FIXED_NOW);
    expect(out).toEqual({ start: '2026-03-16', end: '2026-04-14' });
  });

  it('last_90d — returns a 90-day inclusive window ending today', () => {
    const out = resolveRange({ kind: 'last_90d' }, 'UTC', FIXED_NOW);
    expect(out).toEqual({ start: '2026-01-15', end: '2026-04-14' });
  });

  it('custom — passes through valid YYYY-MM-DD bounds unchanged', () => {
    expect(
      resolveRange({ kind: 'custom', start: '2026-02-03', end: '2026-03-04' }, 'UTC', FIXED_NOW),
    ).toEqual({ start: '2026-02-03', end: '2026-03-04' });
  });

  it('custom — falls back to this_month when bounds are malformed', () => {
    expect(
      resolveRange({ kind: 'custom', start: 'not-a-date', end: '2026-03-04' }, 'UTC', FIXED_NOW),
    ).toEqual({ start: '2026-04-01', end: '2026-04-30' });
  });

  it('custom — falls back to this_month when end < start', () => {
    expect(
      resolveRange({ kind: 'custom', start: '2026-03-04', end: '2026-03-01' }, 'UTC', FIXED_NOW),
    ).toEqual({ start: '2026-04-01', end: '2026-04-30' });
  });

  describe('TZ handling', () => {
    // Instant: 2026-04-01T02:00:00Z.
    // - UTC               → today = 2026-04-01 (April)
    // - America/Los_Angeles → today = 2026-03-31 (still March, UTC-7)
    const aprilBoundary = new Date('2026-04-01T02:00:00Z');

    it('this_month resolves to different months in UTC vs Los Angeles', () => {
      const utc = resolveRange({ kind: 'this_month' }, 'UTC', aprilBoundary);
      const la = resolveRange({ kind: 'this_month' }, 'America/Los_Angeles', aprilBoundary);
      expect(utc).toEqual({ start: '2026-04-01', end: '2026-04-30' });
      expect(la).toEqual({ start: '2026-03-01', end: '2026-03-31' });
    });

    it('ytd end drifts with the viewer TZ calendar date', () => {
      // Same instant as aprilBoundary. NY is UTC-4 → also 2026-03-31 locally.
      const ny = resolveRange({ kind: 'ytd' }, 'America/New_York', aprilBoundary);
      const utc = resolveRange({ kind: 'ytd' }, 'UTC', aprilBoundary);
      expect(ny.end).toBe('2026-03-31');
      expect(utc.end).toBe('2026-04-01');
    });

    it('last_30d keeps a 30-day inclusive window regardless of TZ', () => {
      const ny = resolveRange({ kind: 'last_30d' }, 'America/New_York', aprilBoundary);
      const utc = resolveRange({ kind: 'last_30d' }, 'UTC', aprilBoundary);
      // 30-day span either way.
      const spanDays = (a: string, b: string) => {
        const [ya, ma, da] = a.split('-').map(Number);
        const [yb, mb, db] = b.split('-').map(Number);
        const msA = Date.UTC(ya, ma - 1, da);
        const msB = Date.UTC(yb, mb - 1, db);
        return Math.round((msB - msA) / 86_400_000) + 1;
      };
      expect(spanDays(ny.start, ny.end)).toBe(30);
      expect(spanDays(utc.start, utc.end)).toBe(30);
      // And the two ends differ by one calendar day.
      expect(ny.end).not.toBe(utc.end);
    });
  });
});

describe('serializeRange / parseRange round-trip', () => {
  it('round-trips each preset', () => {
    const presets = ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'ytd', 'last_30d', 'last_90d'] as const;
    for (const kind of presets) {
      const serialized = serializeRange({ kind });
      expect(parseRange(serialized)).toEqual({ kind });
    }
  });

  it('round-trips a custom range', () => {
    const r = { kind: 'custom' as const, start: '2026-02-03', end: '2026-03-04' };
    expect(parseRange(serializeRange(r))).toEqual(r);
  });

  it('returns null for junk input', () => {
    expect(parseRange('junk')).toBeNull();
    expect(parseRange('custom:2026-02-03..not-a-date')).toBeNull();
    expect(parseRange('custom:2026-03-04..2026-02-03')).toBeNull();
    expect(parseRange(null)).toBeNull();
    expect(parseRange(undefined)).toBeNull();
  });
});

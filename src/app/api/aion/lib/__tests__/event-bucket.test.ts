/**
 * Unit tests for eventBucket — the pure boundary function that drives
 * ChatScopeHeader's event-variant field rotation.
 *
 * Scope: §7.3 of docs/reference/aion-event-scope-header-design.md.
 * We don't test formatting (that's aion/__tests__ territory) — just the
 * bucket classification.
 */

import { describe, it, expect } from 'vitest';
import { eventBucket } from '../build-event-scope-prefix';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function d(offsetMs: number, base: number = Date.UTC(2026, 4, 15, 18, 0, 0)) {
  return new Date(base + offsetMs);
}

describe('eventBucket', () => {
  const now = d(0);

  // ── upcoming (> 48h out) ──────────────────────────────────────────────────
  it('classifies 3 days out as upcoming', () => {
    const starts = d(3 * DAY);
    const ends = d(3 * DAY + 6 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('upcoming');
  });

  it('classifies exactly-49-hours-out as upcoming (just over threshold)', () => {
    const starts = d(49 * HOUR);
    const ends = d(49 * HOUR + 4 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('upcoming');
  });

  // ── this_week (0 < delta ≤ 48h) ───────────────────────────────────────────
  it('classifies 36 hours out as this_week', () => {
    const starts = d(36 * HOUR);
    const ends = d(36 * HOUR + 4 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('this_week');
  });

  it('classifies exactly 48h out as this_week (inclusive boundary)', () => {
    const starts = d(48 * HOUR);
    const ends = d(48 * HOUR + 4 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('this_week');
  });

  it('classifies 1 hour before start as this_week', () => {
    const starts = d(HOUR);
    const ends = d(HOUR + 4 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('this_week');
  });

  // ── today (between starts_at and ends_at + 4h) ────────────────────────────
  it('classifies exactly at starts_at as today', () => {
    const starts = d(0);
    const ends = d(6 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('today');
  });

  it('classifies mid-show as today', () => {
    const starts = d(-2 * HOUR);
    const ends = d(4 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('today');
  });

  it('classifies 4h after ends_at as today (inclusive strike window)', () => {
    const starts = d(-10 * HOUR);
    const ends = d(-4 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('today');
  });

  it('classifies 4h+1ms after ends_at as recent (just past boundary)', () => {
    const starts = d(-10 * HOUR);
    const ends = d(-4 * HOUR - 1);
    expect(eventBucket(starts, ends, now)).toBe('recent');
  });

  // ── recent (> ends_at + 4h, ≤ 7d after) ───────────────────────────────────
  it('classifies 2 days post-show as recent', () => {
    const starts = d(-3 * DAY);
    const ends = d(-3 * DAY + 6 * HOUR);
    expect(eventBucket(starts, ends, now)).toBe('recent');
  });

  it('classifies exactly 7 days post-end as recent (inclusive)', () => {
    const starts = d(-8 * DAY);
    const ends = d(-7 * DAY);
    expect(eventBucket(starts, ends, now)).toBe('recent');
  });

  it('classifies 7 days + 1s post-end as other', () => {
    const starts = d(-8 * DAY);
    const ends = d(-7 * DAY - 1000);
    expect(eventBucket(starts, ends, now)).toBe('other');
  });

  // ── other / edge cases ────────────────────────────────────────────────────
  it('classifies null starts_at as other', () => {
    expect(eventBucket(null, null, now)).toBe('other');
  });

  it('falls back to starts_at for today-window when ends_at is null', () => {
    const starts = d(-30 * 60 * 1000);  // 30 min into the show
    expect(eventBucket(starts, null, now)).toBe('today');
  });

  it('classifies null ends_at + 5h after starts_at as recent', () => {
    const starts = d(-5 * HOUR);
    // Without ends_at we use starts_at; 5h > 4h window → recent.
    expect(eventBucket(starts, null, now)).toBe('recent');
  });
});

import { describe, it, expect } from 'vitest';
import {
  getRangeForYear,
  getRangeForMonth,
  getRangeForWeek,
  getRangeForDay,
  getRangeForView,
} from '../date-ranges';

// Helper: parse ISO and return YYYY-MM-DD
const day = (iso: string) => iso.slice(0, 10);

describe('getRangeForYear', () => {
  it('buffers 7 days before start of year and after end of year', () => {
    const r = getRangeForYear(new Date('2026-06-15'));
    // Verify buffer applies to both ends — exact ISO depends on local TZ
    const start = new Date(r.start);
    const end = new Date(r.end);
    // Start should be late December (Jan 1 - 7 days)
    expect(start.getFullYear()).toBeLessThanOrEqual(2025);
    // End should be early January next year (Dec 31 + 7 days)
    expect(end.getFullYear()).toBe(2027);
  });
});

describe('getRangeForMonth', () => {
  it('buffers 7 days around the month boundaries', () => {
    const r = getRangeForMonth(new Date('2026-03-15'));
    const start = new Date(r.start);
    const end = new Date(r.end);
    // Mar 1 - 7 = Feb 22
    expect(start.getMonth()).toBe(1); // February (0-indexed)
    // Mar 31 + 7 → early April
    expect(end.getMonth()).toBe(3); // April (0-indexed)
  });

  it('handles February correctly', () => {
    const r = getRangeForMonth(new Date('2027-02-10'));
    const start = new Date(r.start);
    const end = new Date(r.end);
    expect(start.getMonth()).toBe(0); // January
    expect(end.getMonth()).toBe(2);   // March
  });
});

describe('getRangeForWeek', () => {
  it('starts on Monday (weekStartsOn: 1)', () => {
    // 2026-04-08 is a Wednesday
    const r = getRangeForWeek(new Date('2026-04-08'));
    const start = new Date(r.start);
    const end = new Date(r.end);
    // Monday Apr 6 - 7 = Mar 30
    expect(start.getDate()).toBe(30);
    expect(start.getMonth()).toBe(2); // March
    // Sunday Apr 12 + 7 → around Apr 19-20
    expect(end.getMonth()).toBe(3); // April
  });
});

describe('getRangeForDay', () => {
  it('buffers 7 days around the day', () => {
    const anchor = new Date('2026-04-07');
    const r = getRangeForDay(anchor);
    const start = new Date(r.start);
    const end = new Date(r.end);
    // Start should be ~7 days before the anchor day
    const diffStartMs = anchor.getTime() - start.getTime();
    const diffStartDays = diffStartMs / 86400000;
    expect(diffStartDays).toBeGreaterThanOrEqual(6.5);
    expect(diffStartDays).toBeLessThanOrEqual(8);
    // End should be ~8 days after the anchor day (day end + 7)
    const diffEndMs = end.getTime() - anchor.getTime();
    const diffEndDays = diffEndMs / 86400000;
    expect(diffEndDays).toBeGreaterThanOrEqual(7);
    expect(diffEndDays).toBeLessThanOrEqual(9);
  });
});

describe('getRangeForView', () => {
  it('delegates to correct function for each view', () => {
    const date = new Date('2026-06-15');
    expect(getRangeForView(date, 'year')).toEqual(getRangeForYear(date));
    expect(getRangeForView(date, 'month')).toEqual(getRangeForMonth(date));
    expect(getRangeForView(date, 'week')).toEqual(getRangeForWeek(date));
    expect(getRangeForView(date, 'day')).toEqual(getRangeForDay(date));
  });

  it('defaults to month for unknown view', () => {
    const date = new Date('2026-06-15');
    expect(getRangeForView(date, 'quarter' as any)).toEqual(getRangeForMonth(date));
  });
});

/**
 * Unit tests for formatRelative — the pure logic behind DataFreshnessBadge.
 */

import { describe, it, expect } from 'vitest';
import { formatRelative } from '../DataFreshnessBadge';

const NOW = new Date('2026-04-14T18:00:00Z');

function secondsAgo(sec: number): Date {
  return new Date(NOW.getTime() - sec * 1000);
}

describe('formatRelative', () => {
  it("returns 'just now' within 60 seconds", () => {
    expect(formatRelative(secondsAgo(0), NOW)).toBe('just now');
    expect(formatRelative(secondsAgo(5), NOW)).toBe('just now');
    expect(formatRelative(secondsAgo(59), NOW)).toBe('just now');
  });

  it('returns minutes between 1m and 60m', () => {
    expect(formatRelative(secondsAgo(60), NOW)).toBe('1 min ago');
    expect(formatRelative(secondsAgo(60 * 3), NOW)).toBe('3 min ago');
    expect(formatRelative(secondsAgo(60 * 59), NOW)).toBe('59 min ago');
  });

  it('returns hours between 1h and 24h', () => {
    expect(formatRelative(secondsAgo(60 * 60), NOW)).toBe('1 hr ago');
    expect(formatRelative(secondsAgo(60 * 60 * 5), NOW)).toBe('5 hr ago');
    expect(formatRelative(secondsAgo(60 * 60 * 23), NOW)).toBe('23 hr ago');
  });

  it("returns 'yesterday' between 24h and 48h", () => {
    expect(formatRelative(secondsAgo(60 * 60 * 24), NOW)).toBe('yesterday');
    expect(formatRelative(secondsAgo(60 * 60 * 36), NOW)).toBe('yesterday');
    expect(formatRelative(secondsAgo(60 * 60 * 47), NOW)).toBe('yesterday');
  });

  it('falls back to absolute date past 48h', () => {
    const result = formatRelative(secondsAgo(60 * 60 * 72), NOW); // 3 days ago
    // Just assert it's a non-empty string that isn't one of the relative labels.
    expect(typeof result).toBe('string');
    expect(result).not.toBe('just now');
    expect(result).not.toMatch(/min ago|hr ago|yesterday/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('clamps negative diffs (clock skew) to "just now"', () => {
    // timestamp in the future from now's perspective.
    expect(formatRelative(new Date(NOW.getTime() + 5_000), NOW)).toBe('just now');
  });
});

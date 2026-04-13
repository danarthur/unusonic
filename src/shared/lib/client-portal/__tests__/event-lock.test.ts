import { describe, it, expect } from 'vitest';
import {
  computeEventLock,
  isWithinLateAddWindow,
  LOCKING_EVENT_STATUSES,
} from '../event-lock';

describe('computeEventLock', () => {
  const starts = '2026-06-01T18:00:00Z';

  it('treats unknown and null status as unlocked', () => {
    expect(computeEventLock(starts, null)).toEqual({ locked: false, reason: null });
    expect(computeEventLock(starts, 'planned')).toEqual({ locked: false, reason: null });
    expect(computeEventLock(starts, 'confirmed')).toEqual({ locked: false, reason: null });
    expect(computeEventLock(starts, 'nonsense')).toEqual({ locked: false, reason: null });
  });

  it('locks on in_progress with show_live reason', () => {
    expect(computeEventLock(starts, 'in_progress')).toEqual({ locked: true, reason: 'show_live' });
  });

  it('locks on completed / cancelled / archived', () => {
    expect(computeEventLock(starts, 'completed')).toEqual({ locked: true, reason: 'completed' });
    expect(computeEventLock(starts, 'cancelled')).toEqual({ locked: true, reason: 'cancelled' });
    expect(computeEventLock(starts, 'archived')).toEqual({ locked: true, reason: 'archived' });
  });

  it('does NOT have a show_day reason (A1 kill)', () => {
    // Regression guard — the original 24h show-day lock was removed per §0 A1.
    // If any reader of computeEventLock ever sees 'show_day' again, this test
    // will fail and remind the reviewer to check the amendment rationale.
    const states = [
      computeEventLock(new Date().toISOString(), 'planned'),
      computeEventLock(new Date().toISOString(), 'confirmed'),
      computeEventLock(new Date(Date.now() + 60_000).toISOString(), 'planned'),
    ];
    for (const s of states) {
      expect(s.reason).not.toBe('show_day');
      expect(s.locked).toBe(false);
    }
  });

  it('LOCKING_EVENT_STATUSES matches the switch body', () => {
    // Every status in the constant must actually produce a locked result.
    for (const status of LOCKING_EVENT_STATUSES) {
      expect(computeEventLock(starts, status).locked).toBe(true);
    }
  });
});

describe('isWithinLateAddWindow', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('returns true for an event 1 hour out', () => {
    const startsAt = new Date(now.getTime() + 1 * 60 * 60 * 1000).toISOString();
    expect(isWithinLateAddWindow(startsAt, now)).toBe(true);
  });

  it('returns true for an event exactly 24 hours out', () => {
    const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinLateAddWindow(startsAt, now)).toBe(true);
  });

  it('returns false for an event 25 hours out', () => {
    const startsAt = new Date(now.getTime() + 25 * 60 * 60 * 1000).toISOString();
    expect(isWithinLateAddWindow(startsAt, now)).toBe(false);
  });

  it('returns false for an event in the past', () => {
    const startsAt = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    expect(isWithinLateAddWindow(startsAt, now)).toBe(false);
  });

  it('returns false for null/invalid input', () => {
    expect(isWithinLateAddWindow(null, now)).toBe(false);
    expect(isWithinLateAddWindow('not a date', now)).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import {
  computeDealUrgency,
  shouldSurfaceDaysOutInVoice,
} from '../deal-urgency';

/** Helper to generate an ISO string N days from `now`. */
function daysFromNow(n: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString();
}

describe('computeDealUrgency — multiplier ramp', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('no events, no proposed_date → 1.0 multiplier, null date', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(u.date).toBeNull();
    expect(u.multiplier).toBe(1.0);
    expect(u.suppress).toBe(false);
  });

  it('>90 days out → 0.8 multiplier', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(100, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(u.multiplier).toBe(0.8);
  });

  it('45 days out → 1.0 baseline', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(45, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(u.multiplier).toBe(1.0);
  });

  it('20 days out → 1.2 approaching', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(20, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(u.multiplier).toBe(1.2);
  });

  it('10 days out → 1.5 near-term', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(10, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(u.multiplier).toBe(1.5);
  });

  it('3 days out → 2.0 urgent', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(3, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(u.multiplier).toBe(2.0);
  });

  it('all events past → suppress=true', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [],
      pastEventStartsAt: [daysFromNow(-30, now)],
      dealProposedDate: null,
      now,
    });
    expect(u.suppress).toBe(true);
    expect(u.daysOut).toBeNull();
  });

  it('pre-handoff (no events, has proposed_date) → falls back to proposed_date', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [],
      pastEventStartsAt: [],
      dealProposedDate: daysFromNow(25, now),
      now,
    });
    expect(u.source).toBe('deal_proposed_date');
    expect(u.multiplier).toBe(1.2);
  });

  it('series with mixed dates → picks MIN upcoming', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(15, now), daysFromNow(45, now), daysFromNow(120, now)],
      pastEventStartsAt: [daysFromNow(-30, now)],
      dealProposedDate: null,
      now,
    });
    expect(u.isSeries).toBe(true);
    expect(u.totalShows).toBe(4);
    expect(u.multiplier).toBe(1.2); // 15 days → approaching
  });

  it('single upcoming event is NOT a series', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(20, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(u.isSeries).toBe(false);
    expect(u.totalShows).toBe(1);
  });
});

describe('shouldSurfaceDaysOutInVoice', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('returns true for ≤30 day windows', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(25, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(shouldSurfaceDaysOutInVoice(u)).toBe(true);
  });

  it('returns false for >30 day windows (not a trigger, becomes filler)', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [daysFromNow(60, now)],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(shouldSurfaceDaysOutInVoice(u)).toBe(false);
  });

  it('returns false when date is null', () => {
    const u = computeDealUrgency({
      upcomingEventStartsAt: [],
      pastEventStartsAt: [],
      dealProposedDate: null,
      now,
    });
    expect(shouldSurfaceDaysOutInVoice(u)).toBe(false);
  });
});

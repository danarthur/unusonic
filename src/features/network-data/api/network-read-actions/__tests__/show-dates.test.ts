import { describe, it, expect } from 'vitest';
import { reduceToShowDates, type DatePoint } from '../show-dates';

const NOW = '2026-09-08T12:00:00.000Z';

const p = (date: string, confirmed = true): DatePoint => ({ date, confirmed });

describe('reduceToShowDates', () => {
  it('returns nulls when there is no history', () => {
    expect(reduceToShowDates([], NOW)).toEqual({
      lastWorked: null,
      nextBooked: null,
      nextConfirmed: false,
    });
  });

  it('picks the most recent past date, not the earliest', () => {
    const r = reduceToShowDates([p('2025-01-01'), p('2026-08-16'), p('2024-06-01')], NOW);
    expect(r.lastWorked).toBe('2026-08-16');
    expect(r.nextBooked).toBeNull();
  });

  it('picks the soonest future date, not the furthest', () => {
    const r = reduceToShowDates([p('2027-01-01'), p('2026-09-12'), p('2026-12-25')], NOW);
    expect(r.nextBooked).toBe('2026-09-12');
    expect(r.lastWorked).toBeNull();
  });

  it('splits past and future around now', () => {
    const r = reduceToShowDates([p('2026-08-16'), p('2026-09-12')], NOW);
    expect(r.lastWorked).toBe('2026-08-16');
    expect(r.nextBooked).toBe('2026-09-12');
  });

  it('treats a date exactly at now as worked, not upcoming', () => {
    const r = reduceToShowDates([p(NOW)], NOW);
    expect(r.lastWorked).toBe(NOW);
    expect(r.nextBooked).toBeNull();
  });

  // A proposed date is a guess someone typed into a pipeline record. The card
  // must be able to say "booked" only when it is a real scheduled show.
  it('reports whether the next date is confirmed', () => {
    expect(reduceToShowDates([p('2026-09-12', false)], NOW).nextConfirmed).toBe(false);
    expect(reduceToShowDates([p('2026-09-12', true)], NOW).nextConfirmed).toBe(true);
  });

  it('takes the confirmed flag from the winning date, not from any date', () => {
    // The nearer show is proposed; a confirmed one sits behind it. The answer
    // describes the date actually shown.
    const r = reduceToShowDates([p('2026-09-12', false), p('2026-11-01', true)], NOW);
    expect(r.nextBooked).toBe('2026-09-12');
    expect(r.nextConfirmed).toBe(false);
  });
});

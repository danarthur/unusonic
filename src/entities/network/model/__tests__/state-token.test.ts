/**
 * The one thing to know before you do anything else.
 *
 * I-PASS opens every clinical handover with a single word before any prose, so
 * the reader gets the triage bit first. This is that slot, and the ordering is
 * the design: it is by what would change the next thing you do, not by severity
 * in the abstract.
 */

import { describe, it, expect } from 'vitest';
import { entityStateToken, showDatesFromProductions } from '../state-token';

const NOW = new Date('2026-09-09T12:00:00Z');
const iso = (daysFromNow: number) =>
  new Date(Date.UTC(2026, 8, 9 + daysFromNow)).toISOString().slice(0, 10);

describe('entityStateToken', () => {
  it('says nothing about a contact with no history', () => {
    // Inventing "no activity" for a new contact trains people to stop reading
    // the slot, which costs more than the empty space saves.
    expect(entityStateToken({}, NOW)).toBeNull();
  });

  it('leads with do-not-rebook, because you may be about to book them', () => {
    const token = entityStateToken(
      { doNotRebook: true, theyOweUs: 5000, nextBooked: iso(2) },
      NOW,
    );
    expect(token?.label).toBe('Do not rebook');
    expect(token?.tone).toBe('warning');
  });

  it('puts an imminent show ahead of the ledger', () => {
    // Imminence beats money: the show changes the conversation you are about to
    // have, the invoice will still be there afterwards.
    const token = entityStateToken({ theyOweUs: 2400, nextBooked: iso(9) }, NOW);
    expect(token?.label).toBe('Next show in 9 days');
  });

  it('reads today and tomorrow as words', () => {
    expect(entityStateToken({ nextBooked: iso(0) }, NOW)?.label).toBe('Next show today');
    expect(entityStateToken({ nextBooked: iso(1) }, NOW)?.label).toBe('Next show tomorrow');
  });

  it('falls to money when the next show is further out than a fortnight', () => {
    const token = entityStateToken({ theyOweUs: 2400, nextBooked: iso(40) }, NOW);
    expect(token?.label).toBe('$2,400 outstanding');
  });

  it('keeps the two money directions apart', () => {
    // One number for both would hide whichever is smaller, and they answer
    // different questions.
    expect(entityStateToken({ theyOweUs: 2400 }, NOW)?.label).toBe('$2,400 outstanding');
    expect(entityStateToken({ weOweThem: 900 }, NOW)?.label).toBe('$900 to pay');
  });

  it('mentions a distant show when nothing more pressing applies', () => {
    expect(entityStateToken({ nextBooked: iso(40) }, NOW)?.label).toBe('Next show in 40 days');
  });

  it('ignores a show that has already happened', () => {
    expect(entityStateToken({ nextBooked: iso(-3) }, NOW)).toBeNull();
  });

  it('calls a relationship quiet after six months of nothing either way', () => {
    const token = entityStateToken({ lastWorked: iso(-200) }, NOW);
    expect(token?.label).toBe('Quiet 6 months');
  });

  it('does not call someone quiet when a show is on the books', () => {
    expect(entityStateToken({ lastWorked: iso(-200), nextBooked: iso(40) }, NOW)?.label).toBe(
      'Next show in 40 days',
    );
  });

  it('does not call someone quiet who worked last month', () => {
    expect(entityStateToken({ lastWorked: iso(-30) }, NOW)).toBeNull();
  });

  it('reads a calendar date as a calendar date', () => {
    // A date-only value parsed as local time renders a day early anywhere west
    // of London, which would put a show "today" that is actually tomorrow.
    const lateInTheDay = new Date('2026-09-09T23:30:00Z');
    expect(entityStateToken({ nextBooked: '2026-09-10' }, lateInTheDay)?.label).toBe(
      'Next show tomorrow',
    );
  });
});

describe('showDatesFromProductions', () => {
  const p = (date: string | null, band: 'in_play' | 'booked' | 'past') => ({ date, band });

  it('takes the soonest booked show and the latest past one', () => {
    expect(showDatesFromProductions([
      p('2026-12-01', 'booked'),
      p('2026-10-04', 'booked'),
      p('2026-03-02', 'past'),
      p('2026-06-18', 'past'),
    ])).toEqual({ nextBooked: '2026-10-04', lastWorked: '2026-06-18' });
  });

  it('does not count a proposal as a show you have', () => {
    // In play is pre-contract. Telling someone they have a show in nine days
    // because a quote is out would be worse than saying nothing.
    expect(showDatesFromProductions([p('2026-10-04', 'in_play')])).toEqual({
      nextBooked: null,
      lastWorked: null,
    });
  });

  it('ignores productions with no date', () => {
    expect(showDatesFromProductions([p(null, 'booked'), p(null, 'past')])).toEqual({
      nextBooked: null,
      lastWorked: null,
    });
  });

  it('survives an empty list', () => {
    expect(showDatesFromProductions([])).toEqual({ nextBooked: null, lastWorked: null });
  });
});

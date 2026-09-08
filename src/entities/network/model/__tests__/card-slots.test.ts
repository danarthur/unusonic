import { describe, it, expect } from 'vitest';
import { resolveCardSlots, isFlagged, CARD_SLOT_COUNT } from '../card-slots';
import type { NetworkNode } from '../types';

const NOW = new Date('2026-09-08T12:00:00.000Z');

/**
 * A show at 7pm local, expressed the way ops.events.starts_at stores it.
 *
 * Built from local time on purpose: a hard-coded UTC instant lands on a
 * different calendar day depending on where the suite runs, which would make
 * these assertions pass in California and fail in Tokyo without anything being
 * wrong. Date-only fixtures are written as literals, since that is exactly the
 * shape deals.proposed_date returns.
 */
const showAt = (y: number, m: number, d: number) =>
  new Date(y, m - 1, d, 19, 0, 0).toISOString();

function node(over: Partial<NetworkNode> = {}, meta: Partial<NetworkNode['meta']> = {}): NetworkNode {
  return {
    id: 'edge-1',
    entityId: 'ent-1',
    kind: 'external_partner',
    gravity: 'inner_circle',
    identity: { name: 'Test', avatarUrl: null, label: 'Partner', entityType: 'person' },
    meta: { ...meta },
    ...over,
  } as NetworkNode;
}

const texts = (n: NetworkNode) => resolveCardSlots(n, NOW).map((s) => s.text);

describe('resolveCardSlots', () => {
  it('returns nothing when the entity has nothing to say', () => {
    expect(resolveCardSlots(node(), NOW)).toEqual([]);
  });

  it('never exceeds the fixed slot count', () => {
    const n = node(
      { employer: { entityId: 'c', name: 'Pure Lavish' } },
      {
        outstanding_balance: 2400,
        nextBooked: '2026-09-12',
        nextConfirmed: true,
        lastWorked: '2026-08-16',
        region: 'Napa, CA',
      },
    );
    expect(resolveCardSlots(n, NOW)).toHaveLength(CARD_SLOT_COUNT);
  });

  it('promotes the next candidate when a field is absent, rather than leaving a hole', () => {
    // No balance and no upcoming show: the person still gets three full lines.
    const n = node(
      { employer: { entityId: 'c', name: 'Pure Lavish' } },
      { lastWorked: '2026-08-16', region: 'Napa, CA' },
    );
    expect(texts(n)).toEqual(['Last show Aug 16', 'Pure Lavish', 'Napa, CA']);
  });

  describe('money', () => {
    it('states the direction rather than a bare amount', () => {
      expect(texts(node({}, { outstanding_balance: 2400 }))).toEqual(['Owes $2,400']);
    });

    it('stays off the card when there is nothing outstanding', () => {
      expect(texts(node({}, { outstanding_balance: 0 }))).toEqual([]);
    });
  });

  describe('upcoming work', () => {
    it('reads a near date as a weekday, because that is how the question is asked', () => {
      const n = node({}, { nextBooked: showAt(2026, 9, 12), nextConfirmed: true });
      expect(texts(n)).toEqual(['Booked Sat']);
    });

    it('reads a far date as a date', () => {
      const n = node({}, { nextBooked: showAt(2026, 11, 1), nextConfirmed: true });
      expect(texts(n)).toEqual(['Booked Nov 1']);
    });

    // Calling a pipeline guess "booked" would put someone on a show that was
    // never confirmed.
    it('does not call a proposed date a booking', () => {
      const n = node({}, { nextBooked: '2026-11-01', nextConfirmed: false });
      expect(texts(n)).toEqual(['Proposed Nov 1']);
    });

    // deals.proposed_date is a date column. Parsing "2026-11-01" gives midnight
    // UTC, and formatting that in local time renders "Oct 31" anywhere west of
    // Greenwich -- every proposed date a day early.
    it('does not shift a date-only value backwards in a western timezone', () => {
      const n = node({}, { nextBooked: '2026-11-01', nextConfirmed: true });
      expect(texts(n)).toEqual(['Booked Nov 1']);
    });
  });

  it('includes the year on a past show once it is no longer this year', () => {
    const n = node({}, { lastWorked: '2025-08-16' });
    expect(texts(n)).toEqual(['Last show Aug 16, 2025']);
  });

  describe('by shape', () => {
    it('leads a venue with where it is', () => {
      const n = node(
        { identity: { name: 'The Estate', avatarUrl: null, label: 'Venue', entityType: 'venue' } },
        { region: 'Napa, CA', outstanding_balance: 800 },
      );
      expect(texts(n)).toEqual(['Napa, CA', 'Owes $800']);
    });

    it('leads a company with its people once money is settled', () => {
      const n = node(
        {
          identity: { name: 'Brandi Jane Events', avatarUrl: null, label: 'Partner', entityType: 'company' },
          affiliates: [
            { entityId: 'a', name: 'Brandi Jane', jobTitle: null },
            { entityId: 'b', name: 'Alexa Infranca', jobTitle: null },
            { entityId: 'c', name: 'Gia Russo', jobTitle: null },
          ],
        },
        {},
      );
      expect(texts(n)).toEqual(['Brandi Jane, Alexa Infranca +1']);
    });

    it('gives a couple the same lines as a person', () => {
      const n = node(
        { identity: { name: 'The Hales', avatarUrl: null, label: 'Client', entityType: 'couple' } },
        { nextBooked: '2026-11-01', nextConfirmed: true },
      );
      expect(texts(n)).toEqual(['Booked Nov 1']);
    });
  });
});

describe('isFlagged', () => {
  // Used to render only for core nodes, so the flag was invisible on exactly
  // the relationships where "never again" matters most.
  it('flags a partner, not just an employee', () => {
    const n = node({ kind: 'external_partner', gravity: 'outer_orbit' }, { doNotRebook: true });
    expect(isFlagged(n)).toBe(true);
  });

  it('is false when unset', () => {
    expect(isFlagged(node())).toBe(false);
  });
});

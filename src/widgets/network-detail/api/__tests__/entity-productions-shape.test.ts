import { describe, it, expect } from 'vitest';
import {
  classifyBand,
  wasWorked,
  composeProductions,
  type DealRow,
  type EventRow,
  type ComposeInput,
} from '../entity-productions-shape';

const NOW = new Date('2026-09-08T12:00:00.000Z');

function deal(over: Partial<DealRow> = {}): DealRow {
  return {
    id: 'd1',
    title: 'Hale wedding',
    status: 'inquiry',
    proposed_date: '2026-11-01',
    event_id: null,
    budget_estimated: null,
    main_contact_id: null,
    organization_id: null,
    event_archetype: 'wedding',
    ...over,
  };
}

function event(over: Partial<EventRow> = {}): EventRow {
  return {
    id: 'e1',
    title: 'Hale wedding — reception',
    starts_at: '2026-11-01T19:00:00.000Z',
    status: 'scheduled',
    lifecycle_status: null,
    deal_id: 'd1',
    client_entity_id: null,
    ...over,
  };
}

function input(over: Partial<ComposeInput> = {}): ComposeInput {
  return {
    entityId: 'ent-1',
    deals: [],
    eventsByDealId: new Map(),
    orphanEvents: [],
    stakeholderRoleByDeal: new Map(),
    crewRoleByDeal: new Map(),
    viaPersonByDeal: new Map(),
    now: NOW,
    ...over,
  };
}

// deals.status holds the stage KIND -- working / won / lost -- not the stage
// name. Stage names are configurable per workspace; the kinds are not.
describe('classifyBand', () => {
  const FUTURE = '2026-12-01';
  const PAST = '2026-01-01';

  it('treats an undated working deal as in play', () => {
    expect(classifyBand(null, null, null, NOW)).toBe('in_play');
    expect(classifyBand('working', null, null, NOW)).toBe('in_play');
  });

  it('keeps a working deal in play while its date is ahead', () => {
    expect(classifyBand('working', null, FUTURE, NOW)).toBe('in_play');
  });

  // The bug this replaces: a proposal from three months ago sat under "In play"
  // looking like live work, because the stage still said proposal.
  it('does not leave a working deal in play once its date has passed', () => {
    expect(classifyBand('working', null, PAST, NOW)).toBe('past');
  });

  it('puts won work in booked until it happens, then past', () => {
    expect(classifyBand('won', null, FUTURE, NOW)).toBe('booked');
    expect(classifyBand('won', null, PAST, NOW)).toBe('past');
  });

  it('puts a lost deal in the past whatever its date says', () => {
    expect(classifyBand('lost', null, FUTURE, NOW)).toBe('past');
  });

  // An event only exists after handover, so its presence means real work.
  it('treats a handed-off show as booked, then past once it has happened', () => {
    expect(classifyBand('working', 'planned', FUTURE, NOW)).toBe('booked');
    expect(classifyBand('working', 'planned', PAST, NOW)).toBe('past');
  });
});

describe('wasWorked', () => {
  const base = { band: 'past' as const, dealStatus: null, eventId: null };

  it('counts a won show that has happened', () => {
    expect(wasWorked({ ...base, dealStatus: 'won' } as never)).toBe(true);
  });

  it('counts a handed-off show even before its deal was marked won', () => {
    expect(wasWorked({ ...base, eventId: 'e1' } as never)).toBe(true);
  });

  // A proposal that went quiet lands in the past band too, and counting it
  // would inflate "12 shows" with work that never happened.
  it('does not count a proposal that simply expired', () => {
    expect(wasWorked({ ...base, dealStatus: 'working' } as never)).toBe(false);
  });

  it('does not count anything still ahead', () => {
    expect(wasWorked({ band: 'booked', dealStatus: 'won', eventId: 'e1' } as never)).toBe(false);
  });
});

describe('composeProductions', () => {
  it('returns nothing for an entity with no involvement', () => {
    const { productions, bands } = composeProductions(input());
    expect(productions).toEqual([]);
    expect(bands).toEqual({ in_play: 0, booked: 0, past: 0 });
  });

  it('prefers the event date and title over the deal', () => {
    const { productions } = composeProductions(input({
      deals: [deal({ event_id: 'e1' })],
      eventsByDealId: new Map([['d1', event()]]),
    }));
    expect(productions[0].title).toBe('Hale wedding — reception');
    expect(productions[0].date).toBe('2026-11-01T19:00:00.000Z');
    expect(productions[0].eventId).toBe('e1');
  });

  it('falls back to the deal when there is no event', () => {
    const { productions } = composeProductions(input({ deals: [deal()] }));
    expect(productions[0].title).toBe('Hale wedding');
    expect(productions[0].date).toBe('2026-11-01');
    expect(productions[0].href).toBe('/events?dealId=d1');
  });

  it('sorts newest first across bands', () => {
    const { productions } = composeProductions(input({
      deals: [
        deal({ id: 'old', proposed_date: '2025-01-01' }),
        deal({ id: 'new', proposed_date: '2026-12-01' }),
        deal({ id: 'mid', proposed_date: '2026-03-01' }),
      ],
    }));
    expect(productions.map((p) => p.id)).toEqual(['new', 'mid', 'old']);
  });

  it('counts each band', () => {
    const { bands } = composeProductions(input({
      deals: [
        deal({ id: 'a', status: 'inquiry' }),
        deal({ id: 'b', status: 'won' }),
        deal({ id: 'c', status: 'lost' }),
        deal({ id: 'd', status: 'proposal' }),
      ],
    }));
    expect(bands).toEqual({ in_play: 2, booked: 1, past: 1 });
  });

  describe('how the entity is involved', () => {
    it('calls the client the client', () => {
      const { productions } = composeProductions(input({
        deals: [deal({ organization_id: 'ent-1' })],
      }));
      expect(productions[0].role).toBe('Client');
    });

    it('prefers the most direct involvement when several apply', () => {
      // Named on the deal AND crewed on it: being the client outranks both.
      const { productions } = composeProductions(input({
        deals: [deal({ organization_id: 'ent-1' })],
        stakeholderRoleByDeal: new Map([['d1', 'Planner']]),
        crewRoleByDeal: new Map([['d1', 'DJ']]),
      }));
      expect(productions[0].role).toBe('Client');
    });

    it('falls back through stakeholder then crew', () => {
      expect(composeProductions(input({
        deals: [deal()],
        stakeholderRoleByDeal: new Map([['d1', 'Planner']]),
        crewRoleByDeal: new Map([['d1', 'DJ']]),
      })).productions[0].role).toBe('Planner');

      expect(composeProductions(input({
        deals: [deal()],
        crewRoleByDeal: new Map([['d1', 'DJ']]),
      })).productions[0].role).toBe('DJ');
    });

    // A company is often never named on the deal -- its planner is. Without
    // saying whose work it was, the row has no explanation on screen.
    it('names the person when a company reaches the deal through its team', () => {
      const { productions } = composeProductions(input({
        deals: [deal()],
        viaPersonByDeal: new Map([['d1', 'Brandi Jane']]),
      }));
      expect(productions[0].role).toBe('via Brandi Jane');
      expect(productions[0].viaPersonName).toBe('Brandi Jane');
    });

    it('ranks a direct role above reaching it through the team', () => {
      const { productions } = composeProductions(input({
        deals: [deal()],
        stakeholderRoleByDeal: new Map([['d1', 'Bill-to']]),
        viaPersonByDeal: new Map([['d1', 'Brandi Jane']]),
      }));
      expect(productions[0].role).toBe('Bill-to');
      // Still recorded, so the surface can explain the connection either way.
      expect(productions[0].viaPersonName).toBe('Brandi Jane');
    });
  });

  // The show happened even though no deal was ever created for it.
  it('keeps an event that has no deal behind it', () => {
    const { productions } = composeProductions(input({
      orphanEvents: [event({ id: 'e9', deal_id: null, title: 'Corporate mixer' })],
    }));
    expect(productions).toHaveLength(1);
    expect(productions[0].dealId).toBeNull();
    expect(productions[0].role).toBe('Client');
    expect(productions[0].href).toBe('/events?eventId=e9');
  });
});

import { describe, it, expect } from 'vitest';
import {
  classifyBand,
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

describe('classifyBand', () => {
  it('treats a deal with no status as still in play', () => {
    expect(classifyBand(null, null, null, NOW)).toBe('in_play');
  });

  it('puts pre-contract statuses in play', () => {
    for (const s of ['inquiry', 'proposal', 'contract_sent']) {
      expect(classifyBand(s, null, null, NOW)).toBe('in_play');
    }
  });

  it('puts signed work in booked', () => {
    for (const s of ['contract_signed', 'deposit_received', 'won']) {
      expect(classifyBand(s, null, null, NOW)).toBe('booked');
    }
  });

  it('puts a lost deal in the past rather than leaving it in play', () => {
    expect(classifyBand('lost', null, null, NOW)).toBe('past');
  });

  // After handover the event is what actually happened; the deal's proposed
  // date is a guess nobody went back to correct.
  it('lets the event override the deal status', () => {
    expect(classifyBand('inquiry', 'scheduled', '2026-12-01T00:00:00.000Z', NOW)).toBe('booked');
    expect(classifyBand('inquiry', 'scheduled', '2026-01-01T00:00:00.000Z', NOW)).toBe('past');
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

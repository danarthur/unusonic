/**
 * Tests for the Phase 1 crew confirmation resolver.
 *
 * These tests drive a mocked Supabase client so they run in unit-test
 * isolation. The DB trigger from the same migration is verified live
 * against the dev database and documented in the Phase 1 commit message.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveCrewConfirmation,
  resolveCrewConfirmationBatch,
  type CrewConfirmationState,
} from '../resolve-crew-confirmation';

type Row = Record<string, unknown>;

function makeMockClient(options: {
  eventDealId: string | null;
  portalRows: Row[];
  dealCrewRows: Row[];
}) {
  const eventsMaybeSingle = vi.fn().mockResolvedValue({
    data: options.eventDealId ? { deal_id: options.eventDealId } : null,
    error: null,
  });
  const portalIn = vi.fn().mockResolvedValue({ data: options.portalRows, error: null });
  const dealCrewIn = vi.fn().mockResolvedValue({ data: options.dealCrewRows, error: null });

  const fromImpl = (table: string) => {
    if (table === 'events') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: eventsMaybeSingle,
      };
    }
    if (table === 'crew_assignments') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: portalIn,
      };
    }
    if (table === 'deal_crew') {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: dealCrewIn,
      };
    }
    throw new Error(`unexpected table: ${table}`);
  };

  const schema = vi.fn(() => ({ from: fromImpl }));

  return { schema } as unknown as Awaited<ReturnType<typeof import('@/shared/api/supabase/server').createClient>>;
}

const EVENT_ID = 'e0000000-0000-4000-8000-000000000001';
const DEAL_ID = 'd0000000-0000-4000-8000-000000000001';
const ENTITY_A = 'aaaa0000-0000-4000-8000-000000000001';
const ENTITY_B = 'bbbb0000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveCrewConfirmationBatch', () => {
  it('returns none for every entity when neither table has data', async () => {
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [],
      dealCrewRows: [],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, [ENTITY_A, ENTITY_B]);
    expect(result.get(ENTITY_A)).toEqual<CrewConfirmationState>({
      confirmedAt: null,
      declinedAt: null,
      source: 'none',
    });
    expect(result.get(ENTITY_B)).toEqual<CrewConfirmationState>({
      confirmedAt: null,
      declinedAt: null,
      source: 'none',
    });
  });

  it('returns deal_crew.confirmed_at when only deal_crew has data', async () => {
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [],
      dealCrewRows: [
        { entity_id: ENTITY_A, confirmed_at: '2026-04-01T10:00:00.000Z', declined_at: null },
      ],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, [ENTITY_A]);
    expect(result.get(ENTITY_A)).toEqual<CrewConfirmationState>({
      confirmedAt: '2026-04-01T10:00:00.000Z',
      declinedAt: null,
      source: 'deal_crew',
    });
  });

  it('returns portal status_updated_at when only portal has data', async () => {
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [
        { entity_id: ENTITY_A, status: 'confirmed', status_updated_at: '2026-04-02T12:00:00.000Z' },
      ],
      dealCrewRows: [],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, [ENTITY_A]);
    expect(result.get(ENTITY_A)).toEqual<CrewConfirmationState>({
      confirmedAt: '2026-04-02T12:00:00.000Z',
      declinedAt: null,
      source: 'portal',
    });
  });

  it('picks the freshest timestamp when both sources have confirmations', async () => {
    // Portal confirmed more recently than deal_crew — portal wins.
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [
        { entity_id: ENTITY_A, status: 'confirmed', status_updated_at: '2026-04-05T15:00:00.000Z' },
      ],
      dealCrewRows: [
        { entity_id: ENTITY_A, confirmed_at: '2026-04-01T10:00:00.000Z', declined_at: null },
      ],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, [ENTITY_A]);
    expect(result.get(ENTITY_A)).toEqual<CrewConfirmationState>({
      confirmedAt: '2026-04-05T15:00:00.000Z',
      declinedAt: null,
      source: 'portal',
    });
  });

  it('ties go to deal_crew (the older canonical source)', async () => {
    const ts = '2026-04-05T15:00:00.000Z';
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [{ entity_id: ENTITY_A, status: 'confirmed', status_updated_at: ts }],
      dealCrewRows: [{ entity_id: ENTITY_A, confirmed_at: ts, declined_at: null }],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, [ENTITY_A]);
    expect(result.get(ENTITY_A)?.source).toBe('deal_crew');
  });

  it('handles portal declines via status_updated_at', async () => {
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [
        { entity_id: ENTITY_A, status: 'declined', status_updated_at: '2026-04-03T09:00:00.000Z' },
      ],
      dealCrewRows: [{ entity_id: ENTITY_A, confirmed_at: null, declined_at: null }],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, [ENTITY_A]);
    expect(result.get(ENTITY_A)).toEqual<CrewConfirmationState>({
      confirmedAt: null,
      declinedAt: '2026-04-03T09:00:00.000Z',
      source: 'none',
    });
  });

  it('returns empty when event cannot be resolved to a deal', async () => {
    const client = makeMockClient({
      eventDealId: null,
      portalRows: [
        { entity_id: ENTITY_A, status: 'confirmed', status_updated_at: '2026-04-05T15:00:00.000Z' },
      ],
      dealCrewRows: [],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, [ENTITY_A]);
    // Portal side still resolves even without a deal.
    expect(result.get(ENTITY_A)?.source).toBe('portal');
  });

  it('returns empty map for empty input', async () => {
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [],
      dealCrewRows: [],
    });
    const result = await resolveCrewConfirmationBatch(client, EVENT_ID, []);
    expect(result.size).toBe(0);
  });
});

describe('resolveCrewConfirmation (single)', () => {
  it('delegates to the batch resolver', async () => {
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [],
      dealCrewRows: [
        { entity_id: ENTITY_A, confirmed_at: '2026-04-01T10:00:00.000Z', declined_at: null },
      ],
    });
    const result = await resolveCrewConfirmation(client, EVENT_ID, ENTITY_A);
    expect(result).toEqual<CrewConfirmationState>({
      confirmedAt: '2026-04-01T10:00:00.000Z',
      declinedAt: null,
      source: 'deal_crew',
    });
  });

  it('returns empty state when entity is not found', async () => {
    const client = makeMockClient({
      eventDealId: DEAL_ID,
      portalRows: [],
      dealCrewRows: [],
    });
    const result = await resolveCrewConfirmation(client, EVENT_ID, ENTITY_A);
    // With empty input tables but non-empty entityIds, the resolver still
    // creates an entry for the requested entity with 'none' source.
    expect(result).toEqual<CrewConfirmationState>({
      confirmedAt: null,
      declinedAt: null,
      source: 'none',
    });
  });
});

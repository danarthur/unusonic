import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

vi.mock('@/shared/lib/workspace', () => ({
  getActiveWorkspaceId: vi.fn(),
}));

vi.mock('../deal-crew', () => ({
  syncCrewFromProposal: vi.fn(),
}));

vi.mock('../get-crew-roles-from-proposal', () => ({
  getCrewRolesFromProposalDiagnostic: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getActiveWorkspaceId } = await import('@/shared/lib/workspace');
const { syncCrewFromProposal } = await import('../deal-crew');
const { getCrewRolesFromProposalDiagnostic } = await import('../get-crew-roles-from-proposal');
const { syncCrewFromProposalToEvent } = await import('../sync-crew-from-proposal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let eventBuilder: ReturnType<typeof createQueryBuilder>;
let dealBuilder: ReturnType<typeof createQueryBuilder>;
let crewBeforeBuilder: ReturnType<typeof createQueryBuilder>;
let crewAfterBuilder: ReturnType<typeof createQueryBuilder>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as never);
  vi.mocked(getActiveWorkspaceId).mockResolvedValue('ws-1');

  eventBuilder = createQueryBuilder();
  dealBuilder = createQueryBuilder();
  crewBeforeBuilder = createQueryBuilder();
  crewAfterBuilder = createQueryBuilder();

  // ops.events is called once (event lookup); ops.deal_crew is called twice (before/after counts).
  let opsFromCall = 0;
  const opsSchema = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'events') return eventBuilder;
      if (table === 'deal_crew') {
        opsFromCall++;
        return opsFromCall === 1 ? crewBeforeBuilder : crewAfterBuilder;
      }
      return createQueryBuilder();
    }),
  };
  mockClient.schema.mockReturnValue(opsSchema as never);

  mockClient.from.mockReturnValue(dealBuilder as never);

  vi.mocked(syncCrewFromProposal).mockResolvedValue();
  vi.mocked(getCrewRolesFromProposalDiagnostic).mockResolvedValue({ step: 'no_roles' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('syncCrewFromProposalToEvent', () => {
  it('returns error when no active workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null);
    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(result).toEqual({ success: false, error: 'No active workspace.' });
  });

  it('returns error when event not found', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    const result = await syncCrewFromProposalToEvent('evt-bad');
    expect(result).toEqual({ success: false, error: 'Event not found.' });
  });

  it('returns error when no deal linked to event', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({ data: { id: 'evt-1' }, error: null });
    dealBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('No deal linked');
    }
  });

  it('delegates to syncCrewFromProposal and reports 0 added (with diagnostic) when no rows were created', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({ data: { id: 'evt-1' }, error: null });
    dealBuilder.maybeSingle.mockResolvedValue({ data: { id: 'deal-1' }, error: null });
    crewBeforeBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) => resolve({ count: 2, error: null }));
    crewAfterBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) => resolve({ count: 2, error: null }));
    vi.mocked(getCrewRolesFromProposalDiagnostic).mockResolvedValue({ step: 'ok', rolesFound: ['DJ'] });

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(syncCrewFromProposal).toHaveBeenCalledWith('deal-1');
    expect(result).toEqual({ success: true, added: 0, diagnostic: { step: 'ok', rolesFound: ['DJ'] } });
  });

  it('reports the number of newly added deal_crew rows', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({ data: { id: 'evt-1' }, error: null });
    dealBuilder.maybeSingle.mockResolvedValue({ data: { id: 'deal-1' }, error: null });
    crewBeforeBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) => resolve({ count: 1, error: null }));
    crewAfterBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) => resolve({ count: 4, error: null }));

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(syncCrewFromProposal).toHaveBeenCalledWith('deal-1');
    expect(result).toEqual({ success: true, added: 3 });
  });
});

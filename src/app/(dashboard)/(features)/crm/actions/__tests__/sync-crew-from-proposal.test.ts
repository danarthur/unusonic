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

vi.mock('../get-crew-roles-from-proposal', () => ({
  getCrewRolesFromProposalForDeal: vi.fn(),
  getCrewRolesFromProposalDiagnostic: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getActiveWorkspaceId } = await import('@/shared/lib/workspace');
const { getCrewRolesFromProposalForDeal, getCrewRolesFromProposalDiagnostic } =
  await import('../get-crew-roles-from-proposal');
const { syncCrewFromProposalToEvent } = await import('../sync-crew-from-proposal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let eventBuilder: ReturnType<typeof createQueryBuilder>;
let dealBuilder: ReturnType<typeof createQueryBuilder>;
let updateBuilder: ReturnType<typeof createQueryBuilder>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);
  vi.mocked(getActiveWorkspaceId).mockResolvedValue('ws-1');

  eventBuilder = createQueryBuilder();
  dealBuilder = createQueryBuilder();
  updateBuilder = createQueryBuilder();

  // schema('ops').from('events') — first call returns eventBuilder (select), second returns updateBuilder
  let opsEventsCallCount = 0;
  const opsSchema = {
    from: vi.fn().mockImplementation(() => {
      opsEventsCallCount++;
      return opsEventsCallCount === 1 ? eventBuilder : updateBuilder;
    }),
  };
  mockClient.schema.mockReturnValue(opsSchema as any);

  // from('deals') for deal lookup
  mockClient.from.mockReturnValue(dealBuilder as any);

  vi.mocked(getCrewRolesFromProposalForDeal).mockResolvedValue([]);
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
    eventBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'evt-1', run_of_show_data: null },
      error: null,
    });
    dealBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('No deal linked');
    }
  });

  it('returns success with 0 added and diagnostic when no roles found', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'evt-1', run_of_show_data: null },
      error: null,
    });
    dealBuilder.maybeSingle.mockResolvedValue({ data: { id: 'deal-1' }, error: null });
    vi.mocked(getCrewRolesFromProposalForDeal).mockResolvedValue([]);
    vi.mocked(getCrewRolesFromProposalDiagnostic).mockResolvedValue({ step: 'no_roles' });

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(result).toEqual({ success: true, added: 0, diagnostic: { step: 'no_roles' } });
  });

  it('merges new roles into existing run_of_show_data', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: 'evt-1',
        run_of_show_data: {
          crew_roles: ['DJ'],
          crew_items: [{ role: 'DJ', status: 'confirmed' }],
        },
      },
      error: null,
    });
    dealBuilder.maybeSingle.mockResolvedValue({ data: { id: 'deal-1' }, error: null });
    vi.mocked(getCrewRolesFromProposalForDeal).mockResolvedValue(['DJ', 'Lighting Tech', 'A1 Audio']);

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.added).toBe(2); // Lighting Tech and A1 Audio (DJ already exists)
    }
  });

  it('returns success with 0 when all roles already exist', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: 'evt-1',
        run_of_show_data: {
          crew_roles: ['DJ'],
          crew_items: [{ role: 'DJ', status: 'confirmed' }],
        },
      },
      error: null,
    });
    dealBuilder.maybeSingle.mockResolvedValue({ data: { id: 'deal-1' }, error: null });
    vi.mocked(getCrewRolesFromProposalForDeal).mockResolvedValue(['DJ']);
    vi.mocked(getCrewRolesFromProposalDiagnostic).mockResolvedValue({ step: 'ok', rolesFound: ['DJ'] });

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(result).toEqual({ success: true, added: 0, diagnostic: { step: 'ok', rolesFound: ['DJ'] } });
  });

  it('returns error when update fails', async () => {
    eventBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'evt-1', run_of_show_data: null },
      error: null,
    });
    dealBuilder.maybeSingle.mockResolvedValue({ data: { id: 'deal-1' }, error: null });
    vi.mocked(getCrewRolesFromProposalForDeal).mockResolvedValue(['DJ']);

    // Make the update call return an error
    updateBuilder.then.mockImplementation((resolve: Function) =>
      resolve({ data: null, error: { message: 'update failed' } }),
    );

    const result = await syncCrewFromProposalToEvent('evt-1');
    expect(result).toEqual({ success: false, error: 'update failed' });
  });
});

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks — must appear before dynamic imports
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/shared/lib/workspace', () => ({
  getActiveWorkspaceId: vi.fn(),
}));
vi.mock('@/shared/lib/show-limits', () => ({
  canCreateShow: vi.fn(),
}));
vi.mock('@/features/network-data/model/attribute-keys', () => ({
  INDIVIDUAL_ATTR: {
    category: 'category',
    first_name: 'first_name',
    last_name: 'last_name',
    email: 'email',
    phone: 'phone',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are hoisted)
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getActiveWorkspaceId } = await import('@/shared/lib/workspace');
const { canCreateShow } = await import('@/shared/lib/show-limits');
const { createDeal } = await import('../deal-actions');

type MockClient = ReturnType<typeof createMockSupabaseClient>;

// ---------------------------------------------------------------------------
// Test setup
//
// P0 client-field redesign: createDeal calls public.create_deal_complete with
// the new cast-of-stakeholders contract:
//   p_workspace_id, p_hosts (array), p_poc, p_bill_to, p_planner,
//   p_venue_entity, p_deal, p_note, p_pairing
// Tests verify:
//   1. Input validation runs before any DB work
//   2. The RPC is called with the correct payload shape per host kind
//   3. Workspace/show-limit gates still short-circuit before the RPC
//   4. Errors from the RPC propagate to CreateDealResult
// ---------------------------------------------------------------------------

const BASE_INDIVIDUAL = {
  proposedDate: '2026-04-07',
  hostKind: 'individual' as const,
  personHosts: [{ firstName: 'Jane', lastName: 'Doe' }],
};
const UUID_VENUE = 'b0000000-0000-4000-a000-000000000001';
const UUID_EXISTING_PERSON = 'a0000000-0000-4000-a000-000000000001';

function mockRpcSuccess(client: MockClient, dealId = 'deal-test-1') {
  client.rpc.mockResolvedValue({
    data: { deal_id: dealId, primary_host_entity_id: 'ghost-ent-1', venue_entity_id: null },
    error: null,
  });
}

describe('createDeal', () => {
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    vi.mocked(createClient).mockResolvedValue(mockClient as unknown as Awaited<ReturnType<typeof createClient>>);
    vi.mocked(getActiveWorkspaceId).mockResolvedValue('ws-test-123');
    vi.mocked(canCreateShow).mockResolvedValue({
      allowed: true,
      current: 3,
      limit: 50,
      atWarning: false,
    });
    mockClient.schema.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const qb = createQueryBuilder();
        qb.maybeSingle.mockResolvedValue({ data: null, error: null });
        return qb;
      }),
    }));
    mockRpcSuccess(mockClient);
  });

  it('rejects invalid input (bad date format)', async () => {
    const result = await createDeal({
      ...BASE_INDIVIDUAL,
      proposedDate: 'bad',
    } as unknown as Parameters<typeof createDeal>[0]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain('Date must be yyyy-MM-dd');
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it('returns error when no active workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null as unknown as string);
    const result = await createDeal(BASE_INDIVIDUAL);
    expect(result).toEqual({
      success: false,
      error: 'No active workspace. Complete onboarding or select a workspace.',
    });
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it('returns show_limit_reached when quota exceeded', async () => {
    vi.mocked(canCreateShow).mockResolvedValue({
      allowed: false, current: 10, limit: 10, atWarning: false,
    });
    const result = await createDeal(BASE_INDIVIDUAL);
    expect(result).toMatchObject({
      success: false, error: 'show_limit_reached', current: 10, limit: 10,
    });
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  it('builds individual host payload as a single-element p_hosts array', async () => {
    const result = await createDeal(BASE_INDIVIDUAL);
    expect(result).toMatchObject({ success: true, dealId: 'deal-test-1' });
    expect(mockClient.rpc).toHaveBeenCalledTimes(1);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_workspace_id: 'ws-test-123',
        p_hosts: [
          expect.objectContaining({
            type: 'person',
            display_name: 'Jane Doe',
            attributes: expect.objectContaining({
              is_ghost: true,
              category: 'client',
              first_name: 'Jane',
              last_name: 'Doe',
            }),
          }),
        ],
        p_pairing: 'romantic',
      }),
    );
  });

  it('builds couple host payload as a two-element p_hosts array', async () => {
    await createDeal({
      proposedDate: '2026-04-07',
      hostKind: 'couple',
      pairing: 'romantic',
      personHosts: [
        { firstName: 'Alex', lastName: 'Smith' },
        { firstName: 'Jordan', lastName: 'Smith' },
      ],
    });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_hosts: [
          expect.objectContaining({ display_name: 'Alex Smith' }),
          expect.objectContaining({ display_name: 'Jordan Smith' }),
        ],
        p_pairing: 'romantic',
      }),
    );
  });

  it('builds company host payload as a single-element p_hosts array', async () => {
    await createDeal({
      proposedDate: '2026-04-07',
      hostKind: 'company',
      companyHost: { name: 'Acme Corp' },
    });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_hosts: [
          {
            type: 'company',
            display_name: 'Acme Corp',
            attributes: { is_ghost: true, category: 'client' },
          },
        ],
      }),
    );
  });

  it('passes existing_id when company host has existingId', async () => {
    await createDeal({
      proposedDate: '2026-04-07',
      hostKind: 'company',
      companyHost: { existingId: UUID_EXISTING_PERSON },
    });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_hosts: [{ existing_id: UUID_EXISTING_PERSON }],
      }),
    );
  });

  it('passes venue_entity existing_id when venueId provided', async () => {
    await createDeal({ ...BASE_INDIVIDUAL, venueId: UUID_VENUE });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_venue_entity: { existing_id: UUID_VENUE },
      }),
    );
  });

  it('builds venue_entity payload from venueName', async () => {
    await createDeal({ ...BASE_INDIVIDUAL, venueName: 'The Grand Ballroom' });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_venue_entity: {
          display_name: 'The Grand Ballroom',
          attributes: { is_ghost: true, category: 'venue' },
        },
      }),
    );
  });

  it('forwards POC by host index when pocFromHostIndex is set', async () => {
    await createDeal({ ...BASE_INDIVIDUAL, pocFromHostIndex: 1 });
    const call = mockClient.rpc.mock.calls[0]?.[1] as { p_hosts: unknown[]; p_poc: unknown };
    expect(call?.p_poc).toEqual(call?.p_hosts[0]);
  });

  it('builds independent POC payload from poc fields', async () => {
    await createDeal({
      ...BASE_INDIVIDUAL,
      poc: { firstName: 'Sam', lastName: 'Planner', email: 'sam@plan.com' },
    });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_poc: expect.objectContaining({
          type: 'person',
          display_name: 'Sam Planner',
          attributes: expect.objectContaining({
            email: 'sam@plan.com',
            category: 'client_contact',
          }),
        }),
      }),
    );
  });

  it('builds planner payload from planner fields', async () => {
    await createDeal({
      ...BASE_INDIVIDUAL,
      planner: { firstName: 'Pat', lastName: 'L', email: 'pat@plan.com' },
    });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_planner: expect.objectContaining({
          type: 'person',
          display_name: 'Pat L',
          attributes: expect.objectContaining({ category: 'planner' }),
        }),
      }),
    );
  });

  it('passes notes through p_note', async () => {
    await createDeal({ ...BASE_INDIVIDUAL, notes: 'Initial inquiry' });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_note: { content: 'Initial inquiry', phase_tag: 'general' },
      }),
    );
  });

  it('passes null p_note when notes is empty', async () => {
    await createDeal(BASE_INDIVIDUAL);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({ p_note: null }),
    );
  });

  it('resolves lead source label from leadSourceId before calling RPC', async () => {
    const LEAD_SOURCE_UUID = 'c0000000-0000-4000-a000-000000000001';
    mockClient.schema.mockImplementation((s: string) => ({
      from: vi.fn().mockImplementation((table: string) => {
        const qb = createQueryBuilder();
        if (s === 'ops' && table === 'workspace_lead_sources') {
          qb.maybeSingle.mockResolvedValue({ data: { label: 'Instagram Ads' }, error: null });
        } else {
          qb.maybeSingle.mockResolvedValue({ data: null, error: null });
        }
        return qb;
      }),
    }));
    await createDeal({ ...BASE_INDIVIDUAL, leadSourceId: LEAD_SOURCE_UUID });
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_deal: expect.objectContaining({
          lead_source: 'Instagram Ads',
          lead_source_id: LEAD_SOURCE_UUID,
        }),
      }),
    );
  });

  it('includes warning when approaching show limit', async () => {
    vi.mocked(canCreateShow).mockResolvedValue({
      allowed: true, current: 8, limit: 10, atWarning: true,
    });
    const result = await createDeal(BASE_INDIVIDUAL);
    expect(result).toMatchObject({
      success: true, dealId: 'deal-test-1', warning: 'approaching_show_limit',
    });
  });

  it('returns error when RPC returns an error', async () => {
    mockClient.rpc.mockResolvedValue({
      data: null,
      error: { message: 'create_deal_complete: caller is not a member of workspace ws-test-123' },
    });
    const result = await createDeal(BASE_INDIVIDUAL);
    expect(result).toEqual({
      success: false,
      error: 'create_deal_complete: caller is not a member of workspace ws-test-123',
    });
  });

  it('returns error when RPC returns null data (malformed response)', async () => {
    mockClient.rpc.mockResolvedValue({ data: null, error: null });
    const result = await createDeal(BASE_INDIVIDUAL);
    expect(result).toEqual({
      success: false,
      error: 'create_deal_complete returned no deal_id',
    });
  });
});

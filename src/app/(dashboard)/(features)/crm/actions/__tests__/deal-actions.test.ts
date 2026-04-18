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
  COUPLE_ATTR: {
    partner_a_first: 'partner_a_first',
    partner_a_last: 'partner_a_last',
    partner_a_email: 'partner_a_email',
    partner_b_first: 'partner_b_first',
    partner_b_last: 'partner_b_last',
    partner_b_email: 'partner_b_email',
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
// Post-PR 6 (C4 fix): createDeal now makes a single atomic call to the
// `create_deal_complete` RPC. The tests mock `.rpc(...)` and verify:
//   1. Input validation runs before any DB work
//   2. The RPC is called with the correct payload shape for each clientType
//   3. Workspace/show-limit gates still short-circuit before the RPC
//   4. Errors from the RPC propagate through to the CreateDealResult
//
// The old per-step insert mocks are gone because the inserts now live inside
// the RPC body (PL/pgSQL) — atomicity is a database property, not something
// we can meaningfully unit-test at the TS caller level. Actual rollback
// behavior is proven by the live MCP scenarios documented in the plan doc.
// ---------------------------------------------------------------------------

const VALID_INPUT = { proposedDate: '2026-04-07' };
const UUID_ORG = 'a0000000-0000-4000-a000-000000000001';
const UUID_VENUE = 'b0000000-0000-4000-a000-000000000001';

/** Default: mock the RPC to return a valid deal_id payload. */
function mockRpcSuccess(client: MockClient, dealId = 'deal-test-1') {
  client.rpc.mockResolvedValue({
    data: { deal_id: dealId, client_entity_id: 'ghost-ent-1', venue_entity_id: null },
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
    // Default: lead-source lookup returns empty. Individual tests override.
    // Phase 3i: createDeal now calls resolveStageByTag(workspace, 'initial_contact')
    // before the RPC — stub supabase.schema('ops').from('pipelines') +
    // .from('pipeline_stages') to return a valid default pipeline + stage so
    // the action reaches the rpc('create_deal_complete', ...) call.
    mockClient.schema.mockImplementation((schemaName: string) => ({
      from: vi.fn().mockImplementation((table: string) => {
        const qb = createQueryBuilder();
        if (schemaName === 'ops' && table === 'pipelines') {
          qb.maybeSingle.mockResolvedValue({
            data: { id: 'pipe-default' },
            error: null,
          });
        } else if (schemaName === 'ops' && table === 'pipeline_stages') {
          qb.maybeSingle.mockResolvedValue({
            data: {
              id: 'stage-initial-contact',
              pipeline_id: 'pipe-default',
              slug: 'inquiry',
              kind: 'working',
              tags: ['initial_contact'],
            },
            error: null,
          });
        } else {
          qb.maybeSingle.mockResolvedValue({ data: null, error: null });
        }
        return qb;
      }),
    }));
    mockRpcSuccess(mockClient);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Validation
  // ───────────────────────────────────────────────────────────────────────────

  it('rejects invalid input (bad date format)', async () => {
    const result = await createDeal({ proposedDate: 'bad' } as unknown as Parameters<typeof createDeal>[0]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Date must be yyyy-MM-dd');
    }
    expect(createClient).not.toHaveBeenCalled();
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Workspace guard
  // ───────────────────────────────────────────────────────────────────────────

  it('returns error when no active workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null as unknown as string);
    const result = await createDeal(VALID_INPUT as unknown as Parameters<typeof createDeal>[0]);
    expect(result).toEqual({
      success: false,
      error: 'No active workspace. Complete onboarding or select a workspace.',
    });
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Show-limit enforcement
  // ───────────────────────────────────────────────────────────────────────────

  it('returns show_limit_reached when quota exceeded', async () => {
    vi.mocked(canCreateShow).mockResolvedValue({
      allowed: false,
      current: 10,
      limit: 10,
      atWarning: false,
    });
    const result = await createDeal(VALID_INPUT as unknown as Parameters<typeof createDeal>[0]);
    expect(result).toMatchObject({
      success: false,
      error: 'show_limit_reached',
      current: 10,
      limit: 10,
    });
    expect(mockClient.rpc).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RPC payload — existing organization (passes through as existing_id)
  // ───────────────────────────────────────────────────────────────────────────

  it('calls RPC with existing_id when organizationId is provided', async () => {
    const result = await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(result).toMatchObject({ success: true, dealId: 'deal-test-1' });
    expect(mockClient.rpc).toHaveBeenCalledTimes(1);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_workspace_id: 'ws-test-123',
        p_client_entity: { existing_id: UUID_ORG },
        p_venue_entity: null,
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RPC payload — ghost company
  // ───────────────────────────────────────────────────────────────────────────

  it('builds company client_entity payload when clientName provided', async () => {
    await createDeal({
      ...VALID_INPUT,
      clientName: 'Acme Corp',
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_client_entity: {
          type: 'company',
          display_name: 'Acme Corp',
          attributes: { is_ghost: true, category: 'client' },
        },
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RPC payload — ghost individual
  // ───────────────────────────────────────────────────────────────────────────

  it('builds person client_entity payload for individual client type', async () => {
    await createDeal({
      ...VALID_INPUT,
      clientType: 'individual',
      clientFirstName: 'Jane',
      clientLastName: 'Doe',
      clientEmail: 'jane@example.com',
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_client_entity: expect.objectContaining({
          type: 'person',
          display_name: 'Jane Doe',
          attributes: expect.objectContaining({
            is_ghost: true,
            category: 'client',
            first_name: 'Jane',
            last_name: 'Doe',
            email: 'jane@example.com',
          }),
        }),
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RPC payload — couple with same last name formatting
  // ───────────────────────────────────────────────────────────────────────────

  it('builds couple client_entity with same-last-name formatting', async () => {
    await createDeal({
      ...VALID_INPUT,
      clientType: 'couple',
      clientFirstName: 'Alex',
      clientLastName: 'Smith',
      partnerBFirstName: 'Jordan',
      partnerBLastName: 'Smith',
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_client_entity: expect.objectContaining({
          type: 'couple',
          display_name: 'Alex & Jordan Smith',
          attributes: expect.objectContaining({
            partner_a_first: 'Alex',
            partner_b_first: 'Jordan',
          }),
        }),
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RPC payload — venue
  // ───────────────────────────────────────────────────────────────────────────

  it('builds venue_entity payload when venueName provided', async () => {
    await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
      venueName: 'The Grand Ballroom',
    } as unknown as Parameters<typeof createDeal>[0]);

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

  it('passes venue existing_id when venueId provided', async () => {
    await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
      venueId: UUID_VENUE,
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_venue_entity: { existing_id: UUID_VENUE },
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Planner stakeholder extras
  // ───────────────────────────────────────────────────────────────────────────

  it('passes plannerEntityId through p_stakeholder_extras', async () => {
    const PLANNER = 'd0000000-0000-4000-a000-000000000001';
    await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
      plannerEntityId: PLANNER,
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_stakeholder_extras: { planner_entity_id: PLANNER },
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Notes payload
  // ───────────────────────────────────────────────────────────────────────────

  it('passes notes through p_note when provided', async () => {
    await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
      notes: 'Initial inquiry from web form',
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_note: { content: 'Initial inquiry from web form', phase_tag: 'general' },
      }),
    );
  });

  it('passes null p_note when notes is empty', async () => {
    await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(mockClient.rpc).toHaveBeenCalledWith(
      'create_deal_complete',
      expect.objectContaining({
        p_note: null,
      }),
    );
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Lead source label denormalization (pre-RPC SELECT)
  // ───────────────────────────────────────────────────────────────────────────

  it('resolves lead source label from leadSourceId before calling RPC', async () => {
    const LEAD_SOURCE_UUID = 'c0000000-0000-4000-a000-000000000001';
    mockClient.schema.mockImplementation((s: string) => ({
      from: vi.fn().mockImplementation((table: string) => {
        const qb = createQueryBuilder();
        if (s === 'ops' && table === 'workspace_lead_sources') {
          qb.maybeSingle.mockResolvedValue({ data: { label: 'Instagram Ads' }, error: null });
        } else if (s === 'ops' && table === 'pipelines') {
          // Phase 3i: createDeal resolves the initial_contact stage
          qb.maybeSingle.mockResolvedValue({ data: { id: 'pipe-default' }, error: null });
        } else if (s === 'ops' && table === 'pipeline_stages') {
          qb.maybeSingle.mockResolvedValue({
            data: {
              id: 'stage-initial-contact',
              pipeline_id: 'pipe-default',
              slug: 'inquiry',
              kind: 'working',
              tags: ['initial_contact'],
            },
            error: null,
          });
        } else {
          qb.maybeSingle.mockResolvedValue({ data: null, error: null });
        }
        return qb;
      }),
    }));

    await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
      leadSourceId: LEAD_SOURCE_UUID,
    } as unknown as Parameters<typeof createDeal>[0]);

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

  // ───────────────────────────────────────────────────────────────────────────
  // Show-limit warning
  // ───────────────────────────────────────────────────────────────────────────

  it('includes warning when approaching show limit', async () => {
    vi.mocked(canCreateShow).mockResolvedValue({
      allowed: true,
      current: 8,
      limit: 10,
      atWarning: true,
    });

    const result = await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(result).toMatchObject({
      success: true,
      dealId: 'deal-test-1',
      warning: 'approaching_show_limit',
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // RPC error propagation
  // ───────────────────────────────────────────────────────────────────────────

  it('returns error when RPC returns an error', async () => {
    mockClient.rpc.mockResolvedValue({
      data: null,
      error: { message: 'create_deal_complete: caller is not a member of workspace ws-test-123' },
    });

    const result = await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(result).toEqual({
      success: false,
      error: 'create_deal_complete: caller is not a member of workspace ws-test-123',
    });
  });

  it('returns error when RPC returns null data (malformed response)', async () => {
    mockClient.rpc.mockResolvedValue({ data: null, error: null });

    const result = await createDeal({
      ...VALID_INPUT,
      organizationId: UUID_ORG,
    } as unknown as Parameters<typeof createDeal>[0]);

    expect(result).toEqual({
      success: false,
      error: 'create_deal_complete returned no deal_id',
    });
  });
});

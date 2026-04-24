import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

// We need the real estimatedRoleCost — don't mock package-types
// But we DO need to mock server-only
// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getCrewCostReconciliation } = await import('../crew-cost-reconciliation');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let proposalBuilder: ReturnType<typeof createQueryBuilder>;
let itemsBuilder: ReturnType<typeof createQueryBuilder>;
let crewBuilder: ReturnType<typeof createQueryBuilder>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);

  proposalBuilder = createQueryBuilder();
  itemsBuilder = createQueryBuilder();
  crewBuilder = createQueryBuilder();

  let fromCount = 0;
  mockClient.from.mockImplementation(() => {
    fromCount++;
    if (fromCount === 1) return proposalBuilder as any;
    return itemsBuilder as any;
  });

  mockClient.schema.mockReturnValue({
    from: vi.fn().mockReturnValue(crewBuilder),
  } as any);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('getCrewCostReconciliation', () => {
  it('returns null when no proposal exists', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await getCrewCostReconciliation('deal-1');
    expect(result).toBeNull();
  });

  it('returns zero totals when no crew data on either side', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: { id: 'prop-1' }, error: null });
    itemsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );
    crewBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    const result = await getCrewCostReconciliation('deal-1');
    expect(result).toEqual({
      estimatedTotal: 0,
      actualTotal: 0,
      overage: 0,
      roles: [],
    });
  });

  it('calculates estimated costs from proposal item crew_meta', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: { id: 'prop-1' }, error: null });
    itemsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({
        data: [
          {
            definition_snapshot: {
              crew_meta: {
                required_roles: [
                  { role: 'DJ', booking_type: 'talent', quantity: 1, default_rate: 500 },
                ],
              },
            },
            quantity: 1,
            unit_multiplier: 1,
            is_package_header: null,
            package_instance_id: null,
          },
        ],
        error: null,
      }),
    );
    crewBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    const result = await getCrewCostReconciliation('deal-1');
    expect(result!.estimatedTotal).toBe(500);
    expect(result!.roles).toHaveLength(1);
    expect(result!.roles[0]).toEqual({ role: 'DJ', estimated: 500, actual: 0, delta: -500 });
  });

  it('skips bundle children (non-header with package_instance_id)', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: { id: 'prop-1' }, error: null });
    itemsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({
        data: [
          {
            definition_snapshot: {
              crew_meta: {
                required_roles: [
                  { role: 'DJ', booking_type: 'talent', quantity: 1, default_rate: 500 },
                ],
              },
            },
            quantity: 1,
            unit_multiplier: 1,
            is_package_header: false,
            package_instance_id: 'bundle-1', // bundle child — should be skipped
          },
        ],
        error: null,
      }),
    );
    crewBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    const result = await getCrewCostReconciliation('deal-1');
    expect(result!.estimatedTotal).toBe(0);
  });

  it('computes overage from actual crew costs', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: { id: 'prop-1' }, error: null });
    itemsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({
        data: [
          {
            definition_snapshot: {
              crew_meta: {
                required_roles: [
                  { role: 'Lighting', booking_type: 'labor', quantity: 1, default_rate: 50, default_hours: 8 },
                ],
              },
            },
            quantity: 1,
            unit_multiplier: 1,
            is_package_header: null,
            package_instance_id: null,
          },
        ],
        error: null,
      }),
    );
    crewBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({
        data: [
          { role_note: 'Lighting', day_rate: 500 }, // actual > estimated ($400)
        ],
        error: null,
      }),
    );

    const result = await getCrewCostReconciliation('deal-1');
    expect(result!.estimatedTotal).toBe(400); // 50 * 8
    expect(result!.actualTotal).toBe(500);
    expect(result!.overage).toBe(100);
  });

  it('merges roles from both estimated and actual sides', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: { id: 'prop-1' }, error: null });
    itemsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({
        data: [
          {
            definition_snapshot: {
              crew_meta: {
                required_roles: [
                  { role: 'DJ', booking_type: 'talent', quantity: 1, default_rate: 500 },
                ],
              },
            },
            quantity: 1,
            unit_multiplier: 1,
            is_package_header: null,
            package_instance_id: null,
          },
        ],
        error: null,
      }),
    );
    crewBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({
        data: [
          { role_note: 'DJ', day_rate: 600 },
          { role_note: 'Stagehand', day_rate: 200 }, // not in proposal
        ],
        error: null,
      }),
    );

    const result = await getCrewCostReconciliation('deal-1');
    const djRole = result!.roles.find((r) => r.role === 'DJ');
    const stagehand = result!.roles.find((r) => r.role === 'Stagehand');
    expect(djRole).toEqual({ role: 'DJ', estimated: 500, actual: 600, delta: 100 });
    expect(stagehand).toEqual({ role: 'Stagehand', estimated: 0, actual: 200, delta: 200 });
  });

  it('labels crew with null role_note as "Unspecified"', async () => {
    proposalBuilder.maybeSingle.mockResolvedValue({ data: { id: 'prop-1' }, error: null });
    itemsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );
    crewBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({
        data: [{ role_note: null, day_rate: 300 }],
        error: null,
      }),
    );

    const result = await getCrewCostReconciliation('deal-1');
    expect(result!.roles[0].role).toBe('Unspecified');
  });
});

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { checkItemAvailability, checkBatchAvailability, getCatalogAvailabilityRange } =
  await import('../catalog-availability');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let pkgBuilder: ReturnType<typeof createQueryBuilder>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  pkgBuilder = createQueryBuilder();
  mockClient.from.mockReturnValue(pkgBuilder as any);
  vi.mocked(createClient).mockResolvedValue(mockClient as any);
});

// ---------------------------------------------------------------------------
// checkItemAvailability
// ---------------------------------------------------------------------------
describe('checkItemAvailability', () => {
  it('returns available with zeros for non-rental package', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: { id: 'pkg-1', stock_quantity: 0, category: 'service' },
      error: null,
    });

    const result = await checkItemAvailability('ws-1', 'pkg-1', '2026-06-15');
    expect(result.status).toBe('available');
    expect(result.conflicts).toEqual([]);
  });

  it('returns available with zeros when package not found', async () => {
    pkgBuilder.single.mockResolvedValue({ data: null, error: null });

    const result = await checkItemAvailability('ws-1', 'pkg-bad', '2026-06-15');
    expect(result.status).toBe('available');
  });

  it('returns available when no allocations exist', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: { id: 'pkg-1', stock_quantity: 10, category: 'rental' },
      error: null,
    });
    mockClient.rpc.mockResolvedValue({ data: [], error: null });

    const result = await checkItemAvailability('ws-1', 'pkg-1', '2026-06-15');
    expect(result.status).toBe('available');
    expect(result.stockQuantity).toBe(10);
    expect(result.available).toBe(10);
    expect(result.totalAllocated).toBe(0);
  });

  it('returns shortage when all stock allocated', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: { id: 'pkg-1', stock_quantity: 5, category: 'rental' },
      error: null,
    });
    mockClient.rpc.mockResolvedValue({
      data: [
        { catalog_package_id: 'pkg-1', quantity_allocated: 5, deal_id: 'd-1', deal_title: 'Show A', deal_status: 'won', proposed_date: '2026-06-15' },
      ],
      error: null,
    });

    const result = await checkItemAvailability('ws-1', 'pkg-1', '2026-06-15');
    expect(result.status).toBe('shortage');
    expect(result.available).toBe(0);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].dealTitle).toBe('Show A');
  });

  it('returns tight when 25% or less remaining', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: { id: 'pkg-1', stock_quantity: 8, category: 'rental' },
      error: null,
    });
    mockClient.rpc.mockResolvedValue({
      data: [
        { catalog_package_id: 'pkg-1', quantity_allocated: 6, deal_id: 'd-1', deal_title: 'A', deal_status: 'won', proposed_date: '2026-06-15' },
      ],
      error: null,
    });

    const result = await checkItemAvailability('ws-1', 'pkg-1', '2026-06-15');
    // 2 remaining, ceil(8*0.25) = 2 → 2 <= 2 → tight
    expect(result.status).toBe('tight');
    expect(result.available).toBe(2);
  });

  it('filters allocations to the specific package', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: { id: 'pkg-1', stock_quantity: 10, category: 'rental' },
      error: null,
    });
    mockClient.rpc.mockResolvedValue({
      data: [
        { catalog_package_id: 'pkg-other', quantity_allocated: 8, deal_id: 'd-1', deal_title: 'A', deal_status: 'won', proposed_date: '2026-06-15' },
        { catalog_package_id: 'pkg-1', quantity_allocated: 1, deal_id: 'd-2', deal_title: 'B', deal_status: 'won', proposed_date: '2026-06-15' },
      ],
      error: null,
    });

    const result = await checkItemAvailability('ws-1', 'pkg-1', '2026-06-15');
    expect(result.totalAllocated).toBe(1);
    expect(result.conflicts).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getCatalogAvailabilityRange
// ---------------------------------------------------------------------------
describe('getCatalogAvailabilityRange', () => {
  it('returns mapped allocation rows', async () => {
    mockClient.rpc.mockResolvedValue({
      data: [
        {
          catalog_package_id: 'pkg-1',
          deal_id: 'd-1',
          deal_title: 'Show A',
          deal_status: 'won',
          proposed_date: '2026-06-15',
          quantity_allocated: 3,
          stock_quantity: 10,
        },
      ],
      error: null,
    });

    const result = await getCatalogAvailabilityRange('ws-1', '2026-06-01', '2026-06-30');
    expect(result).toHaveLength(1);
    expect(result[0].catalogPackageId).toBe('pkg-1');
    expect(result[0].quantityAllocated).toBe(3);
  });

  it('returns empty array on error', async () => {
    mockClient.rpc.mockResolvedValue({ data: null, error: { message: 'fail' } });

    const result = await getCatalogAvailabilityRange('ws-1', '2026-06-01', '2026-06-30');
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// checkBatchAvailability
// ---------------------------------------------------------------------------
describe('checkBatchAvailability', () => {
  it('returns empty when no packageIds', async () => {
    const result = await checkBatchAvailability('ws-1', [], '2026-06-15');
    expect(result).toEqual({});
  });

  it('returns empty when no rental packages found', async () => {
    const batchBuilder = createQueryBuilder();
    mockClient.from.mockReturnValue(batchBuilder as any);
    batchBuilder.then.mockImplementation((resolve: Function) =>
      resolve({ data: [], error: null }),
    );

    const result = await checkBatchAvailability('ws-1', ['pkg-1'], '2026-06-15');
    expect(result).toEqual({});
  });

  it('returns availability per package with correct status', async () => {
    const batchBuilder = createQueryBuilder();
    mockClient.from.mockReturnValue(batchBuilder as any);
    batchBuilder.then.mockImplementation((resolve: Function) =>
      resolve({
        data: [
          { id: 'pkg-a', stock_quantity: 10, category: 'rental' },
          { id: 'pkg-b', stock_quantity: 2, category: 'rental' },
        ],
        error: null,
      }),
    );
    mockClient.rpc.mockResolvedValue({
      data: [
        { catalog_package_id: 'pkg-a', quantity_allocated: 1, deal_id: 'd-1', deal_title: 'A', deal_status: 'won', proposed_date: '2026-06-15' },
        { catalog_package_id: 'pkg-b', quantity_allocated: 2, deal_id: 'd-2', deal_title: 'B', deal_status: 'won', proposed_date: '2026-06-15' },
      ],
      error: null,
    });

    const result = await checkBatchAvailability('ws-1', ['pkg-a', 'pkg-b'], '2026-06-15');
    expect(result['pkg-a'].status).toBe('available');
    expect(result['pkg-a'].available).toBe(9);
    expect(result['pkg-b'].status).toBe('shortage');
    expect(result['pkg-b'].available).toBe(0);
  });
});

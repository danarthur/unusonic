import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { swapProposalLineItem } = await import('../proposal-swap-action');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;
let pkgBuilder: ReturnType<typeof createQueryBuilder>;
let updateBuilder: ReturnType<typeof createQueryBuilder>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);

  pkgBuilder = createQueryBuilder();
  updateBuilder = createQueryBuilder();

  let callCount = 0;
  mockClient.from.mockImplementation(() => {
    callCount++;
    return (callCount === 1 ? pkgBuilder : updateBuilder) as any;
  });
});

describe('swapProposalLineItem', () => {
  it('returns error when package not found', async () => {
    pkgBuilder.single.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const r = await swapProposalLineItem('item-1', 'pkg-bad');
    expect(r).toEqual({ success: false, error: 'Package not found' });
  });

  it('swaps line item with new package data', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: {
        id: 'pkg-new',
        name: 'New Speaker',
        price: 300,
        target_cost: 150,
        floor_price: 200,
        is_taxable: true,
        category: 'rental',
        is_sub_rental: false,
        stock_quantity: 10,
        definition: { ingredient_meta: { department: 'Audio' } },
      },
      error: null,
    });

    const r = await swapProposalLineItem('item-1', 'pkg-new');
    expect(r).toEqual({ success: true });

    expect(updateBuilder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        origin_package_id: 'pkg-new',
        name: 'New Speaker',
        unit_price: 300,
        actual_cost: 150,
        is_taxable: true,
      }),
    );
  });

  it('includes inventory_meta for rental packages', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: {
        id: 'pkg-rental',
        name: 'Chairs',
        price: 50,
        target_cost: 20,
        floor_price: 30,
        is_taxable: true,
        category: 'rental',
        is_sub_rental: true,
        stock_quantity: 100,
        definition: { ingredient_meta: { department: 'Furniture' } },
      },
      error: null,
    });

    await swapProposalLineItem('item-1', 'pkg-rental');

    const snapshot = (updateBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .definition_snapshot;
    expect(snapshot.inventory_meta).toEqual({
      is_sub_rental: true,
      stock_quantity: 100,
      department: 'Furniture',
    });
  });

  it('omits inventory_meta for non-rental packages', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: {
        id: 'pkg-service',
        name: 'DJ Service',
        price: 500,
        target_cost: 200,
        floor_price: 400,
        is_taxable: false,
        category: 'service',
        definition: null,
      },
      error: null,
    });

    await swapProposalLineItem('item-1', 'pkg-service');

    const snapshot = (updateBuilder.update as ReturnType<typeof vi.fn>).mock.calls[0][0]
      .definition_snapshot;
    expect(snapshot.inventory_meta).toBeUndefined();
  });

  it('returns error when update fails', async () => {
    pkgBuilder.single.mockResolvedValue({
      data: { id: 'pkg-1', name: 'X', price: 100, target_cost: null, floor_price: null, is_taxable: true, category: 'fee', definition: null },
      error: null,
    });
    updateBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: null, error: { message: 'update failed' } }),
    );

    const r = await swapProposalLineItem('item-1', 'pkg-1');
    expect(r).toEqual({ success: false, error: 'update failed' });
  });
});

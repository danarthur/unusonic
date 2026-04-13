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
const {
  bulkArchivePackages,
  bulkRestorePackages,
  bulkAdjustPrice,
  bulkSetTags,
  bulkSetTaxStatus,
  importCatalogFromCSV,
} = await import('../catalog-bulk-actions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);
});

// ---------------------------------------------------------------------------
// bulkArchivePackages
// ---------------------------------------------------------------------------
describe('bulkArchivePackages', () => {
  it('returns empty when no IDs', async () => {
    expect(await bulkArchivePackages([])).toEqual({});
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it('updates is_active to false', async () => {
    const b = createQueryBuilder();
    mockClient.from.mockReturnValue(b as any);

    await bulkArchivePackages(['pkg-1', 'pkg-2']);
    expect(b.update).toHaveBeenCalledWith({ is_active: false });
    expect(b.in).toHaveBeenCalledWith('id', ['pkg-1', 'pkg-2']);
  });

  it('returns error on failure', async () => {
    const b = createQueryBuilder();
    b.then.mockImplementation((resolve: Function) =>
      resolve({ data: null, error: { message: 'DB error' } }),
    );
    mockClient.from.mockReturnValue(b as any);

    const r = await bulkArchivePackages(['pkg-1']);
    expect(r).toEqual({ error: 'DB error' });
  });
});

// ---------------------------------------------------------------------------
// bulkRestorePackages
// ---------------------------------------------------------------------------
describe('bulkRestorePackages', () => {
  it('returns empty when no IDs', async () => {
    expect(await bulkRestorePackages([])).toEqual({});
  });

  it('updates is_active to true', async () => {
    const b = createQueryBuilder();
    mockClient.from.mockReturnValue(b as any);

    await bulkRestorePackages(['pkg-1']);
    expect(b.update).toHaveBeenCalledWith({ is_active: true });
  });
});

// ---------------------------------------------------------------------------
// bulkAdjustPrice
// ---------------------------------------------------------------------------
describe('bulkAdjustPrice', () => {
  it('returns empty when no IDs', async () => {
    expect(await bulkAdjustPrice([], 10)).toEqual({});
  });

  it('applies percentage increase and rounds to cents', async () => {
    const fetchBuilder = createQueryBuilder();
    fetchBuilder.then.mockImplementation((resolve: Function) =>
      resolve({
        data: [{ id: 'pkg-1', price: 100 }],
        error: null,
      }),
    );
    const updateBuilder = createQueryBuilder();

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? fetchBuilder : updateBuilder) as any;
    });

    await bulkAdjustPrice(['pkg-1'], 10); // +10%
    expect(updateBuilder.update).toHaveBeenCalledWith({ price: 110 });
  });

  it('applies percentage decrease and floors at 0', async () => {
    const fetchBuilder = createQueryBuilder();
    fetchBuilder.then.mockImplementation((resolve: Function) =>
      resolve({
        data: [{ id: 'pkg-1', price: 5 }],
        error: null,
      }),
    );
    const updateBuilder = createQueryBuilder();

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? fetchBuilder : updateBuilder) as any;
    });

    await bulkAdjustPrice(['pkg-1'], -200); // -200% → negative → clamped to 0
    expect(updateBuilder.update).toHaveBeenCalledWith({ price: 0 });
  });

  it('returns error when fetch fails', async () => {
    const fetchBuilder = createQueryBuilder();
    fetchBuilder.then.mockImplementation((resolve: Function) =>
      resolve({ data: null, error: { message: 'fetch error' } }),
    );
    mockClient.from.mockReturnValue(fetchBuilder as any);

    const r = await bulkAdjustPrice(['pkg-1'], 10);
    expect(r).toEqual({ error: 'fetch error' });
  });
});

// ---------------------------------------------------------------------------
// bulkSetTags
// ---------------------------------------------------------------------------
describe('bulkSetTags', () => {
  it('returns empty when no IDs or tags', async () => {
    expect(await bulkSetTags([], ['tag-1'], 'add')).toEqual({});
    expect(await bulkSetTags(['pkg-1'], [], 'add')).toEqual({});
  });

  it('upserts tags in add mode', async () => {
    const b = createQueryBuilder();
    mockClient.from.mockReturnValue(b as any);

    await bulkSetTags(['pkg-1', 'pkg-2'], ['tag-a'], 'add');
    expect(b.upsert).toHaveBeenCalledWith(
      [
        { package_id: 'pkg-1', tag_id: 'tag-a' },
        { package_id: 'pkg-2', tag_id: 'tag-a' },
      ],
      { ignoreDuplicates: true },
    );
  });

  it('deletes tags in remove mode', async () => {
    const b = createQueryBuilder();
    mockClient.from.mockReturnValue(b as any);

    await bulkSetTags(['pkg-1'], ['tag-a'], 'remove');
    expect(b.delete).toHaveBeenCalled();
    expect(b.eq).toHaveBeenCalledWith('package_id', 'pkg-1');
    expect(b.in).toHaveBeenCalledWith('tag_id', ['tag-a']);
  });
});

// ---------------------------------------------------------------------------
// bulkSetTaxStatus
// ---------------------------------------------------------------------------
describe('bulkSetTaxStatus', () => {
  it('returns empty when no IDs', async () => {
    expect(await bulkSetTaxStatus([], true)).toEqual({});
  });

  it('updates is_taxable', async () => {
    const b = createQueryBuilder();
    mockClient.from.mockReturnValue(b as any);

    await bulkSetTaxStatus(['pkg-1'], true);
    expect(b.update).toHaveBeenCalledWith({ is_taxable: true });
  });
});

// ---------------------------------------------------------------------------
// importCatalogFromCSV
// ---------------------------------------------------------------------------
describe('importCatalogFromCSV', () => {
  it('imports valid rows', async () => {
    const b = createQueryBuilder();
    mockClient.from.mockReturnValue(b as any);

    const r = await importCatalogFromCSV('ws-1', [
      { name: 'Speaker', category: 'rental', price: 50 },
      { name: 'DJ', category: 'service', price: 500 },
    ]);
    expect(r.imported).toBe(2);
    expect(r.errors).toEqual([]);
  });

  it('rejects rows with missing name', async () => {
    const r = await importCatalogFromCSV('ws-1', [
      { name: '', category: 'rental', price: 50 },
    ]);
    expect(r.imported).toBe(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toContain('Missing name');
  });

  it('rejects rows with unknown category', async () => {
    const r = await importCatalogFromCSV('ws-1', [
      { name: 'X', category: 'unknown', price: 50 },
    ]);
    expect(r.errors[0].message).toContain('Unknown category');
  });

  it('rejects rows with invalid price', async () => {
    const r = await importCatalogFromCSV('ws-1', [
      { name: 'X', category: 'fee', price: -10 },
    ]);
    expect(r.errors[0].message).toContain('Invalid price');
  });

  it('maps category aliases correctly', async () => {
    const b = createQueryBuilder();
    mockClient.from.mockReturnValue(b as any);

    const r = await importCatalogFromCSV('ws-1', [
      { name: 'A', category: 'gear', price: 10 },       // → rental
      { name: 'B', category: 'labor', price: 20 },       // → service
      { name: 'C', category: 'performer', price: 30 },   // → talent
      { name: 'D', category: 'consumable', price: 5 },   // → retail_sale
      { name: 'E', category: 'surcharge', price: 15 },   // → fee
      { name: 'F', category: 'bundle', price: 100 },     // → package
    ]);
    expect(r.imported).toBe(6);
    expect(r.errors).toEqual([]);
  });

  it('sets is_taxable based on category', async () => {
    const b = createQueryBuilder();
    const insertedBatches: unknown[] = [];
    b.insert = vi.fn().mockImplementation((batch) => {
      insertedBatches.push(...(batch as unknown[]));
      return b;
    });
    mockClient.from.mockReturnValue(b as any);

    await importCatalogFromCSV('ws-1', [
      { name: 'Chair', category: 'rental', price: 10 },
      { name: 'DJ', category: 'service', price: 100 },
    ]);

    const chair = insertedBatches.find((r: any) => r.name === 'Chair') as any;
    const dj = insertedBatches.find((r: any) => r.name === 'DJ') as any;
    expect(chair.is_taxable).toBe(true);  // rental = taxable
    expect(dj.is_taxable).toBe(false);    // service = not taxable
  });
});

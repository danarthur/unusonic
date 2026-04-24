import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('../catalog-embeddings', () => ({
  generateAndUpsertEmbedding: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { createPackage, updatePackage } = await import('../package-actions');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;

const basePkg = {
  id: 'pkg-1',
  workspace_id: 'ws-1',
  name: 'Test Package',
  category: 'service',
  price: 100,
  is_active: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);
});

// ---------------------------------------------------------------------------
// createPackage
// ---------------------------------------------------------------------------
describe('createPackage', () => {
  it('rejects empty name', async () => {
    const r = await createPackage('ws-1', { name: '  ', category: 'service', price: 100 });
    expect(r).toEqual({ package: null, error: 'Name is required.' });
  });

  it('rejects negative price', async () => {
    const r = await createPackage('ws-1', { name: 'Test', category: 'service', price: -5 });
    expect(r).toEqual({ package: null, error: 'Price must be a non-negative number.' });
  });

  it('rejects NaN price', async () => {
    const r = await createPackage('ws-1', { name: 'Test', category: 'service', price: NaN });
    expect(r).toEqual({ package: null, error: 'Price must be a non-negative number.' });
  });

  it('creates package with correct defaults', async () => {
    const insertBuilder = createQueryBuilder();
    insertBuilder.single.mockResolvedValue({ data: { ...basePkg }, error: null });

    // from('packages').insert → first call
    // from('package_tags') → second call (tags fetch)
    const tagsBuilder = createQueryBuilder();
    tagsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? insertBuilder : tagsBuilder) as any;
    });

    const r = await createPackage('ws-1', {
      name: '  My Package  ',
      category: 'rental',
      price: 50,
    });
    expect(r.error).toBeUndefined();
    expect(r.package).toBeTruthy();

    expect(insertBuilder.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: 'ws-1',
        name: 'My Package', // trimmed
        category: 'rental',
        price: 50,
        is_active: true,
        is_taxable: true,  // default
        unit_type: 'flat',  // default
        unit_multiplier: 1, // default
        stock_quantity: 0,   // default
      }),
    );
  });

  it('returns error when insert fails', async () => {
    const insertBuilder = createQueryBuilder();
    insertBuilder.single.mockResolvedValue({
      data: null,
      error: { message: 'duplicate name' },
    });
    mockClient.from.mockReturnValue(insertBuilder as any);

    const r = await createPackage('ws-1', { name: 'Dup', category: 'fee', price: 10 });
    expect(r).toEqual({ package: null, error: 'duplicate name' });
  });

  it('inserts tag links when tagIds provided', async () => {
    const insertBuilder = createQueryBuilder();
    insertBuilder.single.mockResolvedValue({ data: { ...basePkg }, error: null });

    const tagsInsertBuilder = createQueryBuilder();
    const tagsFetchBuilder = createQueryBuilder();
    tagsFetchBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return insertBuilder as any;
      if (callCount === 2) return tagsInsertBuilder as any;
      return tagsFetchBuilder as any;
    });

    await createPackage('ws-1', {
      name: 'Tagged',
      category: 'service',
      price: 100,
      tagIds: ['tag-a', 'tag-b'],
    });

    expect(tagsInsertBuilder.insert).toHaveBeenCalledWith([
      { package_id: 'pkg-1', tag_id: 'tag-a' },
      { package_id: 'pkg-1', tag_id: 'tag-b' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// updatePackage
// ---------------------------------------------------------------------------
describe('updatePackage', () => {
  it('rejects negative price', async () => {
    const r = await updatePackage('pkg-1', { price: -1 });
    expect(r).toEqual({ package: null, error: 'Price must be a non-negative number.' });
  });

  it('updates specified fields only', async () => {
    const updateBuilder = createQueryBuilder();
    updateBuilder.single.mockResolvedValue({ data: { ...basePkg, name: 'Renamed' }, error: null });
    const tagsBuilder = createQueryBuilder();
    tagsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return updateBuilder as any;
      return tagsBuilder as any;
    });

    const r = await updatePackage('pkg-1', { name: '  Renamed  ' });
    expect(r.package?.name).toBe('Renamed');
    expect(updateBuilder.update).toHaveBeenCalledWith({ name: 'Renamed' });
  });

  it('replaces all tags when tagIds is provided', async () => {
    const deleteBuilder = createQueryBuilder();
    const insertBuilder = createQueryBuilder();
    const fetchBuilder = createQueryBuilder();
    fetchBuilder.single.mockResolvedValue({ data: basePkg, error: null });
    const tagsBuilder = createQueryBuilder();
    tagsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return deleteBuilder as any;
      if (callCount === 2) return insertBuilder as any;
      if (callCount === 3) return fetchBuilder as any;
      return tagsBuilder as any;
    });

    await updatePackage('pkg-1', { tagIds: ['tag-new'] });
    expect(deleteBuilder.delete).toHaveBeenCalled();
    expect(insertBuilder.insert).toHaveBeenCalledWith([
      { package_id: 'pkg-1', tag_id: 'tag-new' },
    ]);
  });

  it('returns current package when no fields changed', async () => {
    const fetchBuilder = createQueryBuilder();
    fetchBuilder.single.mockResolvedValue({ data: basePkg, error: null });
    const tagsBuilder = createQueryBuilder();
    tagsBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }),
    );

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      return (callCount === 1 ? fetchBuilder : tagsBuilder) as any;
    });

    const r = await updatePackage('pkg-1', {});
    expect(r.package).toBeTruthy();
    expect(r.package?.name).toBe('Test Package');
  });
});

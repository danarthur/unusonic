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

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
const { createClient } = await import('@/shared/api/supabase/server');
const { getActiveWorkspaceId } = await import('@/shared/lib/workspace');
const { getCrewRolesFromProposalForDeal, getCrewRolesFromProposalDiagnostic } =
  await import('../get-crew-roles-from-proposal');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(createClient).mockResolvedValue(mockClient as any);
  vi.mocked(getActiveWorkspaceId).mockResolvedValue('ws-1');

  // Default: all from() calls return empty builders
  mockClient.from.mockImplementation(() => {
    const b = createQueryBuilder();
    b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) => resolve({ data: [], error: null }));
    b.maybeSingle.mockResolvedValue({ data: null, error: null });
    return b as any;
  });
});

// ---------------------------------------------------------------------------
// getCrewRolesFromProposalForDeal
// ---------------------------------------------------------------------------
describe('getCrewRolesFromProposalForDeal', () => {
  it('returns empty when no workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null);
    expect(await getCrewRolesFromProposalForDeal('deal-1')).toEqual([]);
  });

  it('returns empty when no proposal found', async () => {
    expect(await getCrewRolesFromProposalForDeal('deal-1')).toEqual([]);
  });

  it('extracts staff_role from service packages', async () => {
    let callNum = 0;
    mockClient.from.mockImplementation(() => {
      callNum++;
      const b = createQueryBuilder();
      if (callNum <= 2) {
        // Proposal queries (accepted/sent, then any)
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [{ id: 'prop-1' }], error: null }),
        );
      } else if (callNum === 3) {
        // proposal_items
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [{ package_id: 'pkg-1', origin_package_id: null }],
            error: null,
          }),
        );
      } else if (callNum === 4) {
        // packages
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [
              {
                id: 'pkg-1',
                category: 'service',
                definition: { ingredient_meta: { staff_role: 'DJ' } },
              },
            ],
            error: null,
          }),
        );
      } else {
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [], error: null }),
        );
      }
      return b as any;
    });

    const roles = await getCrewRolesFromProposalForDeal('deal-1');
    expect(roles).toEqual(['DJ']);
  });

  it('extracts staff_role from bundle ingredients', async () => {
    let callNum = 0;
    mockClient.from.mockImplementation(() => {
      callNum++;
      const b = createQueryBuilder();
      if (callNum <= 2) {
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [{ id: 'prop-1' }], error: null }),
        );
      } else if (callNum === 3) {
        // proposal_items pointing to a bundle
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [{ package_id: 'bundle-1', origin_package_id: null }],
            error: null,
          }),
        );
      } else if (callNum === 4) {
        // Top-level packages — the bundle
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [
              {
                id: 'bundle-1',
                category: 'package',
                definition: {
                  blocks: [
                    { type: 'line_item', catalogId: 'ingredient-1' },
                  ],
                },
              },
            ],
            error: null,
          }),
        );
      } else if (callNum === 5) {
        // Ingredient packages
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [
              {
                id: 'ingredient-1',
                category: 'service',
                definition: { ingredient_meta: { staff_role: 'Lighting Tech' } },
              },
            ],
            error: null,
          }),
        );
      } else {
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [], error: null }),
        );
      }
      return b as any;
    });

    const roles = await getCrewRolesFromProposalForDeal('deal-1');
    expect(roles).toEqual(['Lighting Tech']);
  });

  it('deduplicates roles', async () => {
    let callNum = 0;
    mockClient.from.mockImplementation(() => {
      callNum++;
      const b = createQueryBuilder();
      if (callNum <= 2) {
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [{ id: 'prop-1' }], error: null }),
        );
      } else if (callNum === 3) {
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [
              { package_id: 'pkg-1', origin_package_id: null },
              { package_id: 'pkg-2', origin_package_id: null },
            ],
            error: null,
          }),
        );
      } else if (callNum === 4) {
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [
              { id: 'pkg-1', category: 'service', definition: { ingredient_meta: { staff_role: 'DJ' } } },
              { id: 'pkg-2', category: 'service', definition: { ingredient_meta: { staff_role: 'DJ' } } },
            ],
            error: null,
          }),
        );
      } else {
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [], error: null }),
        );
      }
      return b as any;
    });

    const roles = await getCrewRolesFromProposalForDeal('deal-1');
    expect(roles).toEqual(['DJ']); // not ['DJ', 'DJ']
  });
});

// ---------------------------------------------------------------------------
// getCrewRolesFromProposalDiagnostic
// ---------------------------------------------------------------------------
describe('getCrewRolesFromProposalDiagnostic', () => {
  it('returns no_proposal when workspace missing', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(null);
    const d = await getCrewRolesFromProposalDiagnostic('deal-1');
    expect(d.step).toBe('no_proposal');
  });

  it('returns no_proposal when no proposals exist', async () => {
    const d = await getCrewRolesFromProposalDiagnostic('deal-1');
    expect(d.step).toBe('no_proposal');
  });

  it('returns no_items when proposal has no items', async () => {
    let callNum = 0;
    mockClient.from.mockImplementation(() => {
      callNum++;
      const b = createQueryBuilder();
      if (callNum <= 2) {
        // Proposal queries
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [{ id: 'prop-1', status: 'sent' }], error: null }),
        );
      } else {
        // Items query → empty
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [], error: null }),
        );
      }
      return b as any;
    });

    const d = await getCrewRolesFromProposalDiagnostic('deal-1');
    expect(d.step).toBe('no_items');
    expect(d.proposalId).toBe('prop-1');
  });
});

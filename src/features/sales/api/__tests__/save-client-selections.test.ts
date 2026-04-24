import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
const { getSystemClient } = await import('@/shared/api/supabase/system');
const { saveClientSelections } = await import('../save-client-selections');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let mockClient: ReturnType<typeof createMockSupabaseClient>;

beforeEach(() => {
  vi.clearAllMocks();
  mockClient = createMockSupabaseClient();
  vi.mocked(getSystemClient).mockReturnValue(mockClient as any);
});

// Valid v4 UUID for Zod validation
const VALID_UUID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

describe('saveClientSelections', () => {
  it('rejects empty token', async () => {
    const r = await saveClientSelections('', []);
    expect(r).toEqual({ success: false, newTotal: 0, error: 'Invalid token' });
  });

  it('rejects invalid selections shape', async () => {
    const r = await saveClientSelections('tok-1', [{ bad: true }] as any);
    expect(r).toEqual({ success: false, newTotal: 0, error: 'Invalid selections' });
  });

  it('rejects when proposal not found', async () => {
    const proposalBuilder = createQueryBuilder();
    proposalBuilder.maybeSingle.mockResolvedValue({ data: null, error: null });
    mockClient.from.mockReturnValue(proposalBuilder as any);

    const r = await saveClientSelections('tok-1', [
      { itemId: VALID_UUID, selected: true },
    ]);
    expect(r).toEqual({
      success: false,
      newTotal: 0,
      error: 'Proposal not found or already signed',
    });
  });

  it('rejects when selections are locked', async () => {
    const proposalBuilder = createQueryBuilder();
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: {
        id: 'prop-1',
        status: 'sent',
        client_selections_locked_at: '2026-04-07T00:00:00Z',
      },
      error: null,
    });
    mockClient.from.mockReturnValue(proposalBuilder as any);

    const r = await saveClientSelections('tok-1', [
      { itemId: VALID_UUID, selected: true },
    ]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('locked');
  });

  it('rejects items not belonging to this proposal', async () => {
    const proposalBuilder = createQueryBuilder();
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'prop-1', status: 'sent', client_selections_locked_at: null },
      error: null,
    });

    const ownedBuilder = createQueryBuilder();
    ownedBuilder.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
      resolve({ data: [], error: null }), // No items match
    );

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return proposalBuilder as any;
      return ownedBuilder as any;
    });

    const r = await saveClientSelections('tok-1', [
      { itemId: VALID_UUID, selected: true },
    ]);
    expect(r.success).toBe(false);
    expect(r.error).toContain('do not belong');
  });

  it('upserts selections and recomputes total on success', async () => {
    const proposalBuilder = createQueryBuilder();
    proposalBuilder.maybeSingle.mockResolvedValue({
      data: { id: 'prop-1', status: 'sent', client_selections_locked_at: null },
      error: null,
    });

    const itemId = VALID_UUID;

    let callCount = 0;
    mockClient.from.mockImplementation(() => {
      callCount++;
      const b = createQueryBuilder();
      if (callCount === 1) {
        // Proposal lookup
        b.maybeSingle.mockResolvedValue({
          data: { id: 'prop-1', status: 'sent', client_selections_locked_at: null },
          error: null,
        });
      } else if (callCount === 2) {
        // Owned items check
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: [{ id: itemId }], error: null }),
        );
      } else if (callCount === 3) {
        // Upsert selections
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({ data: null, error: null }),
        );
      } else if (callCount === 4) {
        // Fetch items for total recomputation
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [
              { id: itemId, unit_price: 100, override_price: null, quantity: 2, unit_multiplier: 1, is_optional: true, is_client_visible: true },
            ],
            error: null,
          }),
        );
      } else if (callCount === 5) {
        // Fetch selections
        b.then.mockImplementation((resolve: (...args: unknown[]) => unknown) =>
          resolve({
            data: [{ item_id: itemId, selected: true }],
            error: null,
          }),
        );
      }
      return b as any;
    });

    const r = await saveClientSelections('tok-1', [{ itemId, selected: true }]);
    expect(r.success).toBe(true);
    expect(r.newTotal).toBe(200); // 2 * 1 * 100
  });
});

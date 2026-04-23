/**
 * deal_in_workspace helper tests (Phase 3 §3.5 cross-workspace guard).
 *
 * The public.deal_in_workspace RPC is the belt + SQL RLS check for every
 * Aion write tool. The helper must collapse every failure mode to `false`
 * (no enumeration oracle) and never throw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockData: unknown = null;
let mockError: { message: string } | null = null;

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: () =>
    Promise.resolve({
      rpc: vi.fn().mockImplementation(() =>
        Promise.resolve({ data: mockData, error: mockError }),
      ),
    }),
}));

import { dealInWorkspace } from '../deal-in-workspace';

describe('dealInWorkspace', () => {
  beforeEach(() => {
    mockData = null;
    mockError = null;
  });

  it('returns true when RPC returns true', async () => {
    mockData = true;
    const result = await dealInWorkspace('deal-1');
    expect(result).toBe(true);
  });

  it('returns false when RPC returns false (cross-workspace)', async () => {
    mockData = false;
    const result = await dealInWorkspace('deal-1');
    expect(result).toBe(false);
  });

  it('returns false when dealId is empty / null / undefined', async () => {
    expect(await dealInWorkspace('')).toBe(false);
    expect(await dealInWorkspace(null)).toBe(false);
    expect(await dealInWorkspace(undefined)).toBe(false);
  });

  it('returns false on RPC error (fail-closed)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockError = { message: 'boom' };
    const result = await dealInWorkspace('deal-1');
    expect(result).toBe(false);
  });

  it('returns false when RPC returns non-boolean (defensive)', async () => {
    mockData = 'yes';  // garbage — must not coerce
    const result = await dealInWorkspace('deal-1');
    expect(result).toBe(false);
  });

  it('returns false on RPC null result', async () => {
    mockData = null;
    const result = await dealInWorkspace('deal-1');
    expect(result).toBe(false);
  });
});

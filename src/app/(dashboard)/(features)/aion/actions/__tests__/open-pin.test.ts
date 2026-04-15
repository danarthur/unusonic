/**
 * Unit tests for Phase 3.3 loadPinToAion.
 *
 * The action reads pins via cortex.list_lobby_pins and filters by pin id. The
 * RPC is scoped to (workspace, user), so a cross-user pin id just doesn't
 * appear in the result — we verify that returns null (not an error).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockImplementation((name: string) =>
      name === 'workspace_id' ? { value: 'ws-1' } : undefined,
    ),
  }),
}));

const hoisted = vi.hoisted(() => {
  const flagMock = vi.fn<(ws: string, flag: string) => Promise<boolean>>();
  const rpcMock = vi.fn<(name: string, args: Record<string, unknown>) =>
    Promise<{ data: unknown; error: { message: string } | null }>>();
  const getUserMock = vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>();
  return { flagMock, rpcMock, getUserMock };
});
const { flagMock, rpcMock, getUserMock } = hoisted;

vi.mock('@/shared/lib/feature-flags', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/feature-flags')>(
    '@/shared/lib/feature-flags',
  );
  return {
    ...actual,
    isFeatureEnabled: hoisted.flagMock,
  };
});

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: hoisted.getUserMock,
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({
              data: { workspace_id: 'ws-1' },
              error: null,
            }),
          }),
        }),
      }),
    })),
    schema: () => ({ rpc: hoisted.rpcMock }),
  })),
}));

// ─── System under test ──────────────────────────────────────────────────────

import { loadPinToAion } from '../open-pin';

beforeEach(() => {
  flagMock.mockReset();
  flagMock.mockResolvedValue(true);
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: [], error: null });
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('loadPinToAion', () => {
  it('returns null for an empty pin id', async () => {
    const res = await loadPinToAion('');
    expect(res).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns null when the user is not signed in', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const res = await loadPinToAion('pin-1');
    expect(res).toBeNull();
  });

  it('returns null when the feature flag is off', async () => {
    flagMock.mockResolvedValueOnce(false);
    const res = await loadPinToAion('pin-1');
    expect(res).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('returns null when the pin is not found (not owned by this user)', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          pin_id: 'other-pin',
          title: 'Someone else',
          metric_id: 'finance.revenue_collected',
          args: {},
          cadence: 'hourly',
          last_value: {},
          last_refreshed_at: null,
          position: 0,
        },
      ],
      error: null,
    });
    const res = await loadPinToAion('pin-not-mine');
    expect(res).toBeNull();
  });

  it('returns the pin in the expected shape when owned', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          pin_id: 'pin-1',
          title: 'Revenue · Live Nation',
          metric_id: 'finance.revenue_collected',
          args: { client_id: 'ln', period_start: '2026-01-01', period_end: '2026-04-14' },
          cadence: 'daily',
          last_value: { primary: '$128,400', unit: 'currency' },
          last_refreshed_at: '2026-04-14T09:00:00Z',
          position: 0,
        },
      ],
      error: null,
    });
    const res = await loadPinToAion('pin-1');
    expect(res).toEqual({
      pinId: 'pin-1',
      title: 'Revenue · Live Nation',
      metricId: 'finance.revenue_collected',
      args: { client_id: 'ln', period_start: '2026-01-01', period_end: '2026-04-14' },
      cadence: 'daily',
      lastValue: { primary: '$128,400', unit: 'currency' },
    });
    // Scoping: RPC must be called with this user + workspace.
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe('list_lobby_pins');
    expect(args).toEqual({ p_workspace_id: 'ws-1', p_user_id: 'user-1' });
  });

  it('normalizes an unknown cadence value to manual', async () => {
    rpcMock.mockResolvedValueOnce({
      data: [
        {
          pin_id: 'pin-wat',
          title: 'weird cadence',
          metric_id: 'finance.revenue_collected',
          args: {},
          cadence: 'monthly',
          last_value: {},
          last_refreshed_at: null,
          position: 0,
        },
      ],
      error: null,
    });
    const res = await loadPinToAion('pin-wat');
    expect(res?.cadence).toBe('manual');
  });

  it('returns null when the RPC itself errors', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const res = await loadPinToAion('pin-1');
    expect(res).toBeNull();
  });
});

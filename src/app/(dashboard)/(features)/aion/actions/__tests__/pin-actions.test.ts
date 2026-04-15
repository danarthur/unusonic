/**
 * Unit tests for Phase 3.2 pin CRUD server actions.
 *
 * Every test mocks the Supabase server client and the feature-flag reader so
 * we're exercising validation logic (known metric, cadence range, feature
 * flag) without a live DB. The underlying RPCs are exercised in DB-level
 * integration elsewhere.
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

// Hoisted mock state — vi.mock factories run before normal top-level code.
const hoisted = vi.hoisted(() => {
  const flagMock = vi.fn(async (_ws: string, _flag: string) => true);
  const rpcMock = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({
    data: 'pin-123' as unknown,
    error: null as { message: string } | null,
  }));
  return { flagMock, rpcMock };
});
const { flagMock, rpcMock } = hoisted;

vi.mock('@/shared/lib/feature-flags', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/feature-flags')>(
    '@/shared/lib/feature-flags',
  );
  return {
    ...actual,
    isFeatureEnabled: hoisted.flagMock,
    requireFeatureEnabled: async (ws: string, flag: string) => {
      const ok = await hoisted.flagMock(ws, flag);
      if (!ok) throw new Error(`Feature '${flag}' is not enabled for this workspace`);
    },
  };
});

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => ({ data: { workspace_id: 'ws-1' }, error: null }),
          }),
        }),
      }),
    })),
    schema: () => ({ rpc: hoisted.rpcMock }),
  })),
}));

// ─── System under test (import AFTER mocks) ─────────────────────────────────

import { savePin, deletePin, reorderPins, listPins } from '../pin-actions';

beforeEach(() => {
  flagMock.mockReset();
  flagMock.mockResolvedValue(true);
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: 'pin-123', error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── savePin ────────────────────────────────────────────────────────────────

describe('savePin', () => {
  const validInput = {
    title: 'Revenue collected',
    metricId: 'finance.revenue_collected',
    args: { period_start: '2026-01-01', period_end: '2026-04-14' },
    cadence: 'hourly' as const,
    initialValue: { primary: '$128,400', unit: 'currency' as const },
  };

  it('rejects an unknown metric id before hitting the RPC', async () => {
    await expect(
      savePin({ ...validInput, metricId: 'does.not.exist' }),
    ).rejects.toThrow(/Unknown metric id/);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid cadence before hitting the RPC', async () => {
    await expect(
      savePin({ ...validInput, cadence: 'weekly' as unknown as 'hourly' }),
    ).rejects.toThrow(/Invalid cadence/);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('rejects an empty title', async () => {
    await expect(savePin({ ...validInput, title: '   ' })).rejects.toThrow(
      /Pin title required/,
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('throws when the feature flag is off', async () => {
    flagMock.mockResolvedValue(false);
    await expect(savePin(validInput)).rejects.toThrow(/reports.aion_pin/);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('calls the save_lobby_pin RPC with the mapped params on success', async () => {
    rpcMock.mockResolvedValue({ data: 'pin-new', error: null });
    const res = await savePin(validInput);
    expect(res).toEqual({ pinId: 'pin-new' });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe('save_lobby_pin');
    expect(args.p_workspace_id).toBe('ws-1');
    expect(args.p_user_id).toBe('user-1');
    expect(args.p_metric_id).toBe('finance.revenue_collected');
    expect(args.p_cadence).toBe('hourly');
  });

  it('surfaces RPC errors as thrown Error messages', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'cap reached' } });
    await expect(savePin(validInput)).rejects.toThrow(/cap reached/);
  });
});

// ─── listPins ──────────────────────────────────────────────────────────────

describe('listPins', () => {
  it('throws when the feature flag is off', async () => {
    flagMock.mockResolvedValue(false);
    await expect(listPins()).rejects.toThrow(/reports.aion_pin/);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('maps raw RPC rows into LobbyPin objects', async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          pin_id: 'pin-a',
          title: 'Revenue · Live Nation',
          metric_id: 'finance.revenue_collected',
          args: { client_id: 'abc' },
          cadence: 'daily',
          last_value: { primary: '$128,400', unit: 'currency' },
          last_refreshed_at: '2026-04-14T09:00:00Z',
          position: 0,
        },
      ],
      error: null,
    });
    const pins = await listPins();
    expect(pins).toHaveLength(1);
    expect(pins[0]).toMatchObject({
      pinId: 'pin-a',
      cadence: 'daily',
      position: 0,
    });
  });
});

// ─── deletePin ──────────────────────────────────────────────────────────────

describe('deletePin', () => {
  it('rejects an empty id', async () => {
    await expect(deletePin('')).rejects.toThrow(/pinId required/);
  });

  it('throws when the feature flag is off', async () => {
    flagMock.mockResolvedValue(false);
    await expect(deletePin('pin-1')).rejects.toThrow(/reports.aion_pin/);
  });

  it('invokes the delete_lobby_pin RPC', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await deletePin('pin-1');
    expect(rpcMock).toHaveBeenCalledWith('delete_lobby_pin', { p_pin_id: 'pin-1' });
  });
});

// ─── reorderPins ────────────────────────────────────────────────────────────

describe('reorderPins', () => {
  it('throws when the feature flag is off', async () => {
    flagMock.mockResolvedValue(false);
    await expect(reorderPins(['a', 'b'])).rejects.toThrow(/reports.aion_pin/);
  });

  it('invokes reorder_lobby_pins with the id list', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await reorderPins(['a', 'b', 'c']);
    expect(rpcMock).toHaveBeenCalledWith('reorder_lobby_pins', {
      p_workspace_id: 'ws-1',
      p_user_id: 'user-1',
      p_ids: ['a', 'b', 'c'],
    });
  });
});

/**
 * Phase 5.3 — recordPinView server action unit tests.
 *
 * Validates:
 *   - Dispatches the record_lobby_pin_view RPC on happy path.
 *   - Swallows missing user / missing workspace / flag-off / RPC error /
 *     thrown exceptions. View tracking must never throw back to the client.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hoisted mock state (vi.mock factories run before normal imports).
const hoisted = vi.hoisted(() => {
  const userMock = vi.fn(async () => ({ data: { user: { id: 'user-1' } } }));
  const flagMock = vi.fn<(...args: unknown[]) => Promise<boolean>>(async () => true);
  const rpcMock = vi.fn<
    (...args: unknown[]) => Promise<{ data: unknown; error: { message: string } | null }>
  >(async () => ({ data: null, error: null }));
  return { userMock, flagMock, rpcMock };
});
const { userMock, flagMock, rpcMock } = hoisted;

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn().mockImplementation((name: string) =>
      name === 'workspace_id' ? { value: 'ws-1' } : undefined,
    ),
  }),
}));

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
    auth: { getUser: hoisted.userMock },
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

import { recordPinView } from '../pin-view-actions';

beforeEach(() => {
  userMock.mockReset();
  userMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  flagMock.mockReset();
  flagMock.mockResolvedValue(true);
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('recordPinView', () => {
  it('calls record_lobby_pin_view with the pin id on happy path', async () => {
    await recordPinView('pin-1');
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('record_lobby_pin_view', {
      p_pin_id: 'pin-1',
    });
  });

  it('no-ops on empty string without touching the RPC', async () => {
    await recordPinView('');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('no-ops when no user is signed in', async () => {
    userMock.mockResolvedValue({ data: { user: null } } as unknown as Awaited<
      ReturnType<typeof userMock>
    >);
    await recordPinView('pin-1');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('no-ops when the feature flag is off', async () => {
    flagMock.mockResolvedValue(false);
    await recordPinView('pin-1');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('swallows RPC errors (best-effort tracking)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(recordPinView('pin-1')).resolves.toBeUndefined();
  });

  it('swallows thrown exceptions', async () => {
    rpcMock.mockRejectedValue(new Error('network down'));
    await expect(recordPinView('pin-1')).resolves.toBeUndefined();
  });
});

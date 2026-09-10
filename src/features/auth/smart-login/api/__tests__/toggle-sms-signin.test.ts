/**
 * `toggleSmsSigninEnabled` — the workspace-level SMS sign-in switch.
 *
 * Split out of sms-actions.test.ts, which had grown past the file-length
 * ratchet. The OTP send/verify paths are a different subject from a settings
 * toggle, and this is the one that has to prove the write landed.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  rpcMock: vi.fn(),
  updateMock: vi.fn(),
}));
const { createServerClientMock, rpcMock, updateMock } = hoisted;

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: hoisted.createServerClientMock,
}));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

import { toggleSmsSigninEnabled } from '../sms-actions';

beforeEach(() => {
  createServerClientMock.mockReset();
  rpcMock.mockReset();
  updateMock.mockReset();
});

describe('toggleSmsSigninEnabled', () => {
  it('blocks when caller is unauthenticated', async () => {
    createServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    });

    const result = await toggleSmsSigninEnabled('ws-1', true);
    expect(result.ok).toBe(false);
  });

  it('blocks when user_has_workspace_role returns false', async () => {
    createServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u' } } }) },
      rpc: rpcMock.mockResolvedValue({ data: false, error: null }),
      from: vi.fn(),
    });

    const result = await toggleSmsSigninEnabled('ws-1', true);
    expect(result.ok).toBe(false);
    expect(rpcMock).toHaveBeenCalledWith('user_has_workspace_role', {
      p_workspace_id: 'ws-1',
      p_roles: ['owner', 'admin'],
    });
  });

  it('persists the change when caller is an owner', async () => {
    const fromBuilder = {
      update: updateMock.mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'ws-1' }], error: null }),
    };
    createServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u' } } }) },
      rpc: rpcMock.mockResolvedValue({ data: true, error: null }),
      from: vi.fn(() => fromBuilder),
    });

    const result = await toggleSmsSigninEnabled('ws-1', true);
    expect(result.ok).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({ sms_signin_enabled: true });
  });

  // No UPDATE policy meant zero rows matched, which PostgREST does not call an
  // error -- so the old assertion passed against a mock resolving
  // `{ error: null }`, exactly what production returned while this stayed false.
  it('reports failure when the update matches no rows', async () => {
    const fromBuilder = {
      update: updateMock.mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    createServerClientMock.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u' } } }) },
      rpc: rpcMock.mockResolvedValue({ data: true, error: null }),
      from: vi.fn(() => fromBuilder),
    });

    const result = await toggleSmsSigninEnabled('ws-1', true);
    expect(result.ok).toBe(false);
  });
});

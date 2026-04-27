/**
 * Login Redesign Phase 1 — adminResetMemberPasskey server action.
 *
 * Contract tested:
 *   - Un-authed caller returns not-signed-in, never reaches the RPC.
 *   - RPC failure propagates as a neutral "Not authorized" error, no email.
 *   - RPC success → generates magic link + sends the reset email.
 *   - Post-RPC magic-link failure returns a specific error so UI can tell
 *     the admin to contact the user directly (passkeys already wiped).
 *   - Post-RPC email failure returns a specific error for the same reason.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const getUserMock = vi.fn(async () => ({
    data: { user: { id: 'admin-user-id', email: 'admin@test.local' } },
  }));

  const rpcMock = vi.fn<
    (...args: unknown[]) => Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }>
  >(async () => ({
    data: {
      target_user_id: 'member-user-id',
      target_email: 'member@test.local',
      passkeys_deleted: 2,
    },
    error: null,
  }));

  // workspaces.from(...).select(...).eq(...).maybeSingle()
  const wsMaybeSingleMock = vi.fn(async () => ({
    data: { name: 'Vibe Productions' },
    error: null,
  }));

  // directory.entities.from(...).select(...).eq(...).maybeSingle()
  const entityMaybeSingleMock = vi.fn(async () => ({
    data: { display_name: 'Elena Rios' },
  }));

  const generateLinkMock = vi.fn(async () => ({
    data: {
      properties: { action_link: 'https://example.com/magic-token-abc' },
    },
    error: null,
  }));

  const sendPasskeyResetEmailMock = vi.fn<
    (params: {
      targetEmail: string;
      workspaceName: string;
      inviterName: string;
      magicLinkUrl: string;
    }) => Promise<{ ok: true } | { ok: false; error: string }>
  >(async () => ({ ok: true }));

  return {
    getUserMock,
    rpcMock,
    wsMaybeSingleMock,
    entityMaybeSingleMock,
    generateLinkMock,
    sendPasskeyResetEmailMock,
  };
});

const {
  getUserMock,
  rpcMock,
  wsMaybeSingleMock,
  entityMaybeSingleMock,
  generateLinkMock,
  sendPasskeyResetEmailMock,
} = hoisted;

vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    get: vi.fn(),
    set: vi.fn(),
    getAll: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: hoisted.getUserMock },

    // Public-schema `.from('workspaces')` branch used in the happy path.
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: hoisted.wsMaybeSingleMock,
        }),
      }),
    })),

    // RPC branch — public.reset_member_passkey (moved from cortex.* in Wk 16
    // cortex scope-creep cleanup; lives in public alongside passkeys et al).
    rpc: hoisted.rpcMock,

    // .schema('directory').from('entities')... — caller display_name branch.
    schema: vi.fn((s: string) => {
      if (s === 'directory') {
        return {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: hoisted.entityMaybeSingleMock,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected schema(${s})`);
    }),
  })),
}));

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: hoisted.generateLinkMock,
      },
    },
  })),
}));

vi.mock('@/shared/api/email/send', () => ({
  sendPasskeyResetEmail: hoisted.sendPasskeyResetEmailMock,
}));

import { adminResetMemberPasskey } from '../actions';

beforeEach(() => {
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({
    data: { user: { id: 'admin-user-id', email: 'admin@test.local' } },
  });
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({
    data: {
      target_user_id: 'member-user-id',
      target_email: 'member@test.local',
      passkeys_deleted: 2,
    },
    error: null,
  });
  wsMaybeSingleMock.mockReset();
  wsMaybeSingleMock.mockResolvedValue({
    data: { name: 'Vibe Productions' },
    error: null,
  });
  entityMaybeSingleMock.mockReset();
  entityMaybeSingleMock.mockResolvedValue({
    data: { display_name: 'Elena Rios' },
  });
  generateLinkMock.mockReset();
  generateLinkMock.mockResolvedValue({
    data: {
      properties: { action_link: 'https://example.com/magic-token-abc' },
    },
    error: null,
  });
  sendPasskeyResetEmailMock.mockReset();
  sendPasskeyResetEmailMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('adminResetMemberPasskey', () => {
  it('returns not-signed-in error when caller has no session; RPC is not called', async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null } } as never);

    const result = await adminResetMemberPasskey({
      workspaceId: 'ws-1',
      targetUserId: 'member-user-id',
    });

    expect(result).toEqual({ ok: false, error: 'Not signed in.' });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(sendPasskeyResetEmailMock).not.toHaveBeenCalled();
  });

  it('returns neutral authz error and sends no email when the RPC rejects the caller', async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Not authorized to reset member access', code: '42501' },
    });

    const result = await adminResetMemberPasskey({
      workspaceId: 'ws-1',
      targetUserId: 'member-user-id',
    });

    expect(result).toEqual({
      ok: false,
      error: 'Not authorized to reset member access.',
    });
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(sendPasskeyResetEmailMock).not.toHaveBeenCalled();
  });

  it('sends the passkey-reset email with RPC-returned target email and resolved workspace/inviter names', async () => {
    const result = await adminResetMemberPasskey({
      workspaceId: 'ws-1',
      targetUserId: 'member-user-id',
    });

    expect(result).toEqual({ ok: true });

    expect(rpcMock).toHaveBeenCalledWith('reset_member_passkey', {
      p_workspace_id: 'ws-1',
      p_member_user_id: 'member-user-id',
    });

    expect(generateLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'magiclink',
        email: 'member@test.local',
      }),
    );

    expect(sendPasskeyResetEmailMock).toHaveBeenCalledWith({
      targetEmail: 'member@test.local',
      workspaceName: 'Vibe Productions',
      inviterName: 'Elena Rios',
      magicLinkUrl: 'https://example.com/magic-token-abc',
    });
  });

  it('returns a contact-user-directly error when magic-link generation fails', async () => {
    generateLinkMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'rate limited' },
    } as never);

    const result = await adminResetMemberPasskey({
      workspaceId: 'ws-1',
      targetUserId: 'member-user-id',
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/sign-in link/i);
      expect(result.error).toMatch(/contact/i);
    }
    expect(sendPasskeyResetEmailMock).not.toHaveBeenCalled();
  });

  it('returns a contact-user-directly error when the email send fails', async () => {
    sendPasskeyResetEmailMock.mockResolvedValueOnce({
      ok: false,
      error: 'SMTP down',
    });

    const result = await adminResetMemberPasskey({
      workspaceId: 'ws-1',
      targetUserId: 'member-user-id',
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/email failed/i);
      expect(result.error).toMatch(/contact/i);
    }
    expect(generateLinkMock).toHaveBeenCalledTimes(1);
  });

  it('returns a no-email-on-file error when the RPC returns no target_email', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        target_user_id: 'member-user-id',
        target_email: null,
        passkeys_deleted: 2,
      },
      error: null,
    });

    const result = await adminResetMemberPasskey({
      workspaceId: 'ws-1',
      targetUserId: 'member-user-id',
    });

    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.error).toMatch(/no email/i);
    }
    expect(generateLinkMock).not.toHaveBeenCalled();
    expect(sendPasskeyResetEmailMock).not.toHaveBeenCalled();
  });
});

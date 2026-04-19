/**
 * Guardian server-action tests.
 *
 * Locks the call shape for `addGuardian`, `removeGuardian`,
 * `setGuardianThreshold`, `recordGuardianDeferral`, and
 * `recordGuardianAcceptance`. The Supabase client is stubbed via a fluent
 * builder so we can assert the exact table, filters, and payload each
 * action produces.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

type FluentResult = {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
};

// Scriptable handler — tests push responses per (table + op) tuple.
const queue: Array<{ table: string; op: string; result: FluentResult }> = [];
const calls: Array<{ table: string; op: string; payload?: unknown; filters: Record<string, unknown> }> = [];

function makeBuilder(table: string) {
  let currentOp = 'select';
  let currentPayload: unknown;
  const filters: Record<string, unknown> = {};

  const resolveHandler = () => {
    const index = queue.findIndex((q) => q.table === table && q.op === currentOp);
    const item = index >= 0 ? queue.splice(index, 1)[0] : { result: { data: null, error: null } };
    calls.push({ table, op: currentOp, payload: currentPayload, filters: { ...filters } });
    return item.result;
  };

  const builder: Record<string, unknown> = {
    select: vi.fn((_cols?: string, opts?: { count?: string; head?: boolean }) => {
      currentOp = opts?.head ? 'count' : currentOp === 'select' ? 'select' : currentOp;
      // chain returns builder so callers can continue filtering
      return builder;
    }),
    insert: vi.fn((payload: unknown) => {
      currentOp = 'insert';
      currentPayload = payload;
      return builder;
    }),
    upsert: vi.fn((payload: unknown) => {
      currentOp = 'upsert';
      currentPayload = payload;
      return builder;
    }),
    delete: vi.fn(() => {
      currentOp = 'delete';
      return builder;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      filters[col] = val;
      return builder;
    }),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => resolveHandler()),
    single: vi.fn(async () => resolveHandler()),
    then: (resolve: (val: FluentResult) => unknown) => Promise.resolve(resolveHandler()).then(resolve),
  };
  return builder;
}

// User payload is narrow — matches exactly what guardian-actions reads.
type FakeUser = { id: string; email: string; user_metadata: Record<string, unknown> };
type GetUserResponse = { data: { user: FakeUser | null }; error: null };
const auth = {
  getUser: vi.fn(
    async (): Promise<GetUserResponse> => ({
      data: { user: { id: 'user-1', email: 'owner@example.com', user_metadata: {} } },
      error: null,
    }),
  ),
};

const supabaseStub = {
  auth,
  from: vi.fn((table: string) => makeBuilder(table)),
};

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => supabaseStub),
}));

const sendGuardianInviteEmail = vi.fn(async () => ({ ok: true as const }));
vi.mock('@/shared/api/email/send', () => ({
  sendGuardianInviteEmail: (...args: Parameters<typeof sendGuardianInviteEmail>) =>
    sendGuardianInviteEmail(...args),
}));

async function loadActions() {
  return await import('../guardian-actions');
}

beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
  auth.getUser.mockResolvedValue({
    data: { user: { id: 'user-1', email: 'owner@example.com', user_metadata: {} } },
    error: null,
  });
  sendGuardianInviteEmail.mockClear();
});

describe('guardian-actions', () => {
  it('addGuardian normalizes the email, inserts the row, and fires the invite email', async () => {
    const { addGuardian } = await loadActions();

    // select existing → null (no duplicate); insert returns {id}
    queue.push({ table: 'guardians', op: 'select', result: { data: null, error: null } });
    queue.push({ table: 'guardians', op: 'insert', result: { data: { id: 'g-new' }, error: null } });

    const result = await addGuardian({ name: '  Ana  ', email: '  ANA@example.COM ' });

    expect(result).toEqual({ ok: true, id: 'g-new' });
    expect(sendGuardianInviteEmail).toHaveBeenCalledWith('ana@example.com', expect.any(String));
    const insertCall = calls.find((c) => c.table === 'guardians' && c.op === 'insert');
    expect(insertCall?.payload).toMatchObject({
      owner_id: 'user-1',
      guardian_email: 'ana@example.com',
      status: 'pending',
      display_name: 'Ana',
    });
  });

  it('addGuardian refuses to use the caller as their own guardian', async () => {
    const { addGuardian } = await loadActions();
    const result = await addGuardian({ name: 'Me', email: 'OWNER@example.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/other than yourself/i);
    }
  });

  it('addGuardian rejects malformed emails before touching the DB', async () => {
    const { addGuardian } = await loadActions();
    const result = await addGuardian({ name: '', email: 'not-an-email' });
    expect(result.ok).toBe(false);
    expect(sendGuardianInviteEmail).not.toHaveBeenCalled();
  });

  it('removeGuardian scopes the delete by owner_id', async () => {
    const { removeGuardian } = await loadActions();
    queue.push({ table: 'guardians', op: 'delete', result: { data: null, error: null } });

    const result = await removeGuardian('g-1');
    expect(result).toEqual({ ok: true });
    const del = calls.find((c) => c.op === 'delete');
    expect(del?.filters).toMatchObject({ id: 'g-1', owner_id: 'user-1' });
  });

  it('setGuardianThreshold accepts 2, rejects 1, rejects 4', async () => {
    const { setGuardianThreshold } = await loadActions();
    expect((await setGuardianThreshold({ threshold: 2 })).ok).toBe(true);
    expect((await setGuardianThreshold({ threshold: 1 })).ok).toBe(false);
    expect((await setGuardianThreshold({ threshold: 4 })).ok).toBe(false);
  });

  it('recordGuardianDeferral upserts the deferral flag', async () => {
    const { recordGuardianDeferral } = await loadActions();
    queue.push({ table: 'profiles', op: 'upsert', result: { data: null, error: null } });
    const result = await recordGuardianDeferral();
    expect(result).toEqual({ ok: true });
    const up = calls.find((c) => c.op === 'upsert');
    expect(up?.payload).toMatchObject({
      id: 'user-1',
      guardian_setup_deferred: true,
    });
    expect((up?.payload as Record<string, unknown>).guardian_setup_decision_at).toBeTruthy();
  });

  it('recordGuardianAcceptance clears the deferred flag', async () => {
    const { recordGuardianAcceptance } = await loadActions();
    queue.push({ table: 'profiles', op: 'upsert', result: { data: null, error: null } });
    const result = await recordGuardianAcceptance();
    expect(result).toEqual({ ok: true });
    const up = calls.find((c) => c.op === 'upsert');
    expect(up?.payload).toMatchObject({
      id: 'user-1',
      guardian_setup_deferred: false,
    });
  });

  it('all actions reject when there is no session', async () => {
    const { addGuardian, removeGuardian, recordGuardianDeferral, recordGuardianAcceptance } =
      await loadActions();
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const r1 = await addGuardian({ name: '', email: 'x@y.co' });
    expect(r1.ok).toBe(false);

    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const r2 = await removeGuardian('g-1');
    expect(r2.ok).toBe(false);

    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const r3 = await recordGuardianDeferral();
    expect(r3.ok).toBe(false);

    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const r4 = await recordGuardianAcceptance();
    expect(r4.ok).toBe(false);
  });
});

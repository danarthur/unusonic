/**
 * Tests for publishDomainEvent — Pass 3 Phase 3.
 *
 * This is a smoke test. The function's contract is "never throws, captures
 * errors to Sentry, returns { ok: boolean }". We verify that contract via
 * a mocked service client.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must mock BEFORE the import-under-test so the server-only env vars
// don't need to be set up.
vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
  captureException: vi.fn(),
}));

const { getSystemClient } = await import('@/shared/api/supabase/system');
const { publishDomainEvent } = await import('../publish-domain-event');

function mockClient(insertResult: { error?: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn(() => ({ insert }));
  const schema = vi.fn(() => ({ from }));
  return { schema } as unknown as ReturnType<typeof getSystemClient>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('publishDomainEvent', () => {
  const base = {
    workspaceId: 'w0000000-0000-4000-8000-000000000001',
    eventId: 'e0000000-0000-4000-8000-000000000001',
  };

  it('returns ok:true on successful insert', async () => {
    vi.mocked(getSystemClient).mockReturnValue(mockClient({ error: null }));
    const result = await publishDomainEvent({
      ...base,
      type: 'show.started',
      payload: { startedAt: '2026-04-11T10:00:00.000Z' },
    });
    expect(result.ok).toBe(true);
  });

  it('returns ok:false on insert error without throwing', async () => {
    vi.mocked(getSystemClient).mockReturnValue(
      mockClient({ error: { message: 'RLS denied' } }),
    );
    const result = await publishDomainEvent({
      ...base,
      type: 'show.ended',
      payload: { endedAt: '2026-04-11T22:00:00.000Z', startedAt: null },
    });
    expect(result.ok).toBe(false);
  });

  it('returns ok:false when the client throws', async () => {
    vi.mocked(getSystemClient).mockImplementation(() => {
      throw new Error('env missing');
    });
    const result = await publishDomainEvent({
      ...base,
      type: 'show.wrapped',
      payload: { wrappedAt: '2026-04-12T09:00:00.000Z' },
    });
    expect(result.ok).toBe(false);
  });

  it('does not throw under any condition', async () => {
    vi.mocked(getSystemClient).mockImplementation(() => {
      throw new Error('catastrophic');
    });
    await expect(
      publishDomainEvent({
        ...base,
        type: 'show.started',
        payload: { startedAt: '2026-04-11T10:00:00.000Z' },
      }),
    ).resolves.toBeDefined();
  });
});

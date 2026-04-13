/**
 * song-request-helpers pipeline tests.
 *
 * Pins the mandatory ordering: requireStepUp → checkRateLimit → RPC → logAccess.
 * Every mutation helper MUST run those four steps in that exact order,
 * and any denial path must still write an audit row. Regression here
 * would either:
 *
 *   - skip step-up (the invariant §14.6(1) nuclear violation)
 *   - skip rate limit (spam vector)
 *   - skip audit (blind to compromised-cookie bursts)
 *   - run rate limit BEFORE step-up (wastes rate-limit budget on
 *     unauthenticated probes, a trivial DoS vector)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ── Mocks ─────────────────────────────────────────────────────── */

const stepUpMock = vi.fn();
const checkRateLimitMock = vi.fn();
const logAccessMock = vi.fn();
const rpcMock = vi.fn();

// Track the order each pipeline step was called so tests can assert
// strict ordering, not just "all were called."
const callOrder: string[] = [];

vi.mock('../step-up', async () => {
  const actual = await vi.importActual<typeof import('../step-up')>('../step-up');
  return {
    ...actual,
    requireStepUp: vi.fn(async (...args) => {
      callOrder.push('requireStepUp');
      return stepUpMock(...args);
    }),
  };
});

vi.mock('../rate-limit', () => ({
  checkRateLimit: vi.fn(async (...args) => {
    callOrder.push('checkRateLimit');
    return checkRateLimitMock(...args);
  }),
}));

vi.mock('../audit', async () => {
  const actual = await vi.importActual<typeof import('../audit')>('../audit');
  return {
    ...actual,
    logAccess: vi.fn(async (input) => {
      callOrder.push(`logAccess:${input.action}:${input.outcome}`);
      return logAccessMock(input);
    }),
  };
});

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: () => ({
    rpc: vi.fn(async (name: string, args: unknown) => {
      callOrder.push(`rpc:${name}`);
      return rpcMock(name, args);
    }),
  }),
}));

import {
  addSongRequest,
  updateSongRequest,
  deleteSongRequest,
  type SongRequestContext,
} from '../song-request-helpers';

/* ── Fixtures ──────────────────────────────────────────────────── */

const ctx: SongRequestContext = {
  entityId: 'c1111111-1111-4111-a111-111111111111',
  workspaceId: 'b1111111-1111-4111-a111-111111111111',
  eventId: 'd1111111-1111-4111-a111-111111111111',
  requestId: 'test-req-id',
  ip: '127.0.0.1',
  userAgent: 'test-ua',
};

function resetMocks() {
  stepUpMock.mockReset();
  checkRateLimitMock.mockReset();
  logAccessMock.mockReset();
  rpcMock.mockReset();
  callOrder.length = 0;
}

function approveAll() {
  stepUpMock.mockResolvedValue({
    ok: true,
    method: 'otp',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  checkRateLimitMock.mockResolvedValue({
    allowed: true,
    currentCount: 1,
    retryAfterSeconds: 0,
  });
  rpcMock.mockResolvedValue({
    data: [{ ok: true, reason: null, entry_id: 'new-entry-id', requested_at: '2026-04-10T20:00:00Z' }],
    error: null,
  });
}

beforeEach(resetMocks);

/* ── addSongRequest ────────────────────────────────────────────── */

describe('addSongRequest', () => {
  it('runs step-up → rate-limit → RPC → logAccess in order on happy path', async () => {
    approveAll();

    const result = await addSongRequest(ctx, {
      title: 'Umbrella',
      artist: 'Rihanna',
      tier: 'must_play',
    });

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data.entryId).toBe('new-entry-id');
    }

    expect(callOrder).toEqual([
      'requireStepUp',
      'checkRateLimit',
      'rpc:client_songs_add_request',
      'logAccess:song_add:success',
    ]);
  });

  it('short-circuits on step-up denial without calling rate-limit or RPC', async () => {
    stepUpMock.mockResolvedValue({
      ok: false,
      reason: 'missing',
      required: 'any',
    });

    const result = await addSongRequest(ctx, {
      title: 'Umbrella',
      artist: 'Rihanna',
      tier: 'must_play',
    });

    expect(result.kind).toBe('step_up_required');
    // rate-limit and RPC were NEVER called
    expect(callOrder).not.toContain('checkRateLimit');
    expect(callOrder).not.toContain('rpc:client_songs_add_request');
    // BUT audit was called — even denials log
    expect(callOrder).toContain('logAccess:song_add:denied');
  });

  it('short-circuits on rate-limit denial without calling RPC (and logs throttled)', async () => {
    stepUpMock.mockResolvedValue({
      ok: true,
      method: 'otp',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: false,
      currentCount: 150,
      retryAfterSeconds: 3600,
    });

    const result = await addSongRequest(ctx, {
      title: 'Umbrella',
      artist: 'Rihanna',
      tier: 'must_play',
    });

    expect(result.kind).toBe('rate_limited');
    if (result.kind === 'rate_limited') {
      expect(result.retryAfterSeconds).toBe(3600);
    }
    expect(callOrder).toContain('requireStepUp');
    expect(callOrder).toContain('checkRateLimit');
    expect(callOrder).not.toContain('rpc:client_songs_add_request');
    expect(callOrder).toContain('logAccess:song_add:throttled');
  });

  it('propagates RPC business-logic rejection with the reason string', async () => {
    stepUpMock.mockResolvedValue({
      ok: true,
      method: 'otp',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    checkRateLimitMock.mockResolvedValue({
      allowed: true,
      currentCount: 1,
      retryAfterSeconds: 0,
    });
    rpcMock.mockResolvedValue({
      data: [{ ok: false, reason: 'not_my_event', entry_id: null, requested_at: null }],
      error: null,
    });

    const result = await addSongRequest(ctx, {
      title: 'Test',
      artist: 'Test',
      tier: 'must_play',
    });

    expect(result.kind).toBe('rpc_rejected');
    if (result.kind === 'rpc_rejected') {
      expect(result.reason).toBe('not_my_event');
    }
    expect(callOrder).toContain('logAccess:song_add:denied');
  });

  it('invariant §14.6(1): step-up ALWAYS runs first, even when the RPC would have failed anyway', async () => {
    // If someone re-orders the pipeline to skip step-up for "cheaper"
    // rejections, this test catches it. Step-up is the first check.
    stepUpMock.mockResolvedValue({ ok: false, reason: 'missing', required: 'any' });
    rpcMock.mockResolvedValue({ data: [{ ok: false, reason: 'not_my_event' }], error: null });

    await addSongRequest(ctx, { title: 'X', artist: 'Y', tier: 'must_play' });

    // Step-up fired, RPC did NOT
    expect(callOrder[0]).toBe('requireStepUp');
    expect(callOrder).not.toContain('rpc:client_songs_add_request');
  });
});

/* ── updateSongRequest ─────────────────────────────────────────── */

describe('updateSongRequest', () => {
  it('runs step-up → rate-limit → RPC → logAccess in order', async () => {
    approveAll();
    rpcMock.mockResolvedValue({ data: [{ ok: true, reason: null }], error: null });

    const result = await updateSongRequest(ctx, {
      entryId: 'existing-entry-id',
      tier: 'play_if_possible',
    });

    expect(result.kind).toBe('ok');
    expect(callOrder).toEqual([
      'requireStepUp',
      'checkRateLimit',
      'rpc:client_songs_update_request',
      'logAccess:song_update:success',
    ]);
  });

  it('stamps song_update in the audit row on both success and denial', async () => {
    stepUpMock.mockResolvedValue({ ok: false, reason: 'missing', required: 'any' });

    await updateSongRequest(ctx, { entryId: 'x', tier: 'must_play' });

    expect(callOrder).toContain('logAccess:song_update:denied');
  });
});

/* ── deleteSongRequest ─────────────────────────────────────────── */

describe('deleteSongRequest', () => {
  it('runs step-up → rate-limit → RPC → logAccess in order', async () => {
    approveAll();
    rpcMock.mockResolvedValue({ data: [{ ok: true, reason: null }], error: null });

    const result = await deleteSongRequest(ctx, { entryId: 'existing-entry-id' });

    expect(result.kind).toBe('ok');
    expect(callOrder).toEqual([
      'requireStepUp',
      'checkRateLimit',
      'rpc:client_songs_delete_request',
      'logAccess:song_delete:success',
    ]);
  });

  it('audits song_delete action on denial too', async () => {
    stepUpMock.mockResolvedValue({ ok: false, reason: 'expired', required: 'any' });

    await deleteSongRequest(ctx, { entryId: 'x' });

    expect(callOrder).toContain('logAccess:song_delete:denied');
  });
});

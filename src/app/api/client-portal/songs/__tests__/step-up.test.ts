/**
 * Step-up enforcement integration test.
 *
 * Per Songs design doc §14 and client-portal-design.md §16.3a(4), every
 * mutation endpoint on the client portal MUST return 401 with the
 * structured `step_up_required` body when called without a valid step-up
 * cookie. This test is the regression guard — if any future refactor
 * drops `requireStepUp()` from a route's pipeline, this test goes red
 * before the PR can land.
 *
 * Coverage for slice 10:
 *   - POST /api/client-portal/songs/add
 *   - POST /api/client-portal/songs/update/[id]
 *   - POST /api/client-portal/songs/delete/[id]
 *
 * Strategy: mock `getClientPortalContext` to return a valid session
 * (so we get past the auth gate) and mock `requireStepUp` to return a
 * denial (so we hit the gate we actually care about). The routes run
 * their real body logic on top of those mocks, so any wiring bug shows
 * up as an unexpected status code or response shape.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ── Mocks ─────────────────────────────────────────────────────── */

const stepUpMock = vi.fn();
const contextMock = vi.fn();

vi.mock('@/shared/lib/client-portal/context', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/client-portal/context')>(
    '@/shared/lib/client-portal/context',
  );
  return {
    ...actual,
    getClientPortalContext: vi.fn(async () => contextMock()),
    getRequestIp: vi.fn(async () => '127.0.0.1'),
  };
});

vi.mock('@/shared/lib/client-portal/step-up', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/client-portal/step-up')>(
    '@/shared/lib/client-portal/step-up',
  );
  return {
    ...actual,
    requireStepUp: vi.fn(async () => stepUpMock()),
  };
});

vi.mock('@/shared/lib/client-portal/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, currentCount: 0, retryAfterSeconds: 0 })),
}));

vi.mock('@/shared/lib/client-portal/audit', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/client-portal/audit')>(
    '@/shared/lib/client-portal/audit',
  );
  return {
    ...actual,
    logAccess: vi.fn(async () => {}),
  };
});

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: () => ({
    rpc: vi.fn(async () => ({ data: null, error: null })),
  }),
}));

/* ── Handlers under test (imported after mocks) ───────────────── */

import { POST as addPost } from '@/app/api/client-portal/songs/add/route';
import { POST as updatePost } from '@/app/api/client-portal/songs/update/[id]/route';
import { POST as deletePost } from '@/app/api/client-portal/songs/delete/[id]/route';
import { NextRequest } from 'next/server';

/* ── Test helpers ─────────────────────────────────────────────── */

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const VALID_SESSION = {
  kind: 'anonymous' as const,
  userId: null,
  entities: [
    {
      id: 'c1111111-1111-4111-a111-111111111111',
      displayName: 'Maya Reyes-Okafor',
      ownerWorkspaceId: 'b1111111-1111-4111-a111-111111111111',
      type: 'person',
    },
  ],
  activeEntity: {
    id: 'c1111111-1111-4111-a111-111111111111',
    displayName: 'Maya Reyes-Okafor',
    ownerWorkspaceId: 'b1111111-1111-4111-a111-111111111111',
    type: 'person',
  },
  stepUpVerifiedUntil: null,
  stepUpMethod: null,
};

const VALID_EVENT_ID = 'd1111111-1111-4111-a111-111111111111';
const VALID_ENTRY_ID = 'e1111111-1111-4111-e111-111111111111';

beforeEach(() => {
  stepUpMock.mockReset();
  contextMock.mockReset();
});

/* ── Per-route step-up enforcement ────────────────────────────── */

describe('/api/client-portal/songs/add — step-up enforcement', () => {
  it('returns 401 step_up_required when no step-up cookie is present', async () => {
    contextMock.mockReturnValue(VALID_SESSION);
    stepUpMock.mockReturnValue({ ok: false, reason: 'missing', required: 'any' });

    const req = makeRequest('/api/client-portal/songs/add', {
      eventId: VALID_EVENT_ID,
      title: 'Umbrella',
      artist: 'Rihanna',
      tier: 'must_play',
    });
    const res = await addPost(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.step_up_required).toBe(true);
    expect(body.reason).toBe('missing');
    expect(body.required).toBe('any');
  });

  it('returns 401 step_up_required when the cookie is expired', async () => {
    contextMock.mockReturnValue(VALID_SESSION);
    stepUpMock.mockReturnValue({ ok: false, reason: 'expired', required: 'any' });

    const req = makeRequest('/api/client-portal/songs/add', {
      eventId: VALID_EVENT_ID,
      title: 'Umbrella',
      artist: 'Rihanna',
      tier: 'must_play',
    });
    const res = await addPost(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.step_up_required).toBe(true);
    expect(body.reason).toBe('expired');
  });

  it('rejects unauthenticated sessions with plain 401 (before step-up check)', async () => {
    contextMock.mockReturnValue({
      kind: 'none',
      userId: null,
      entities: [],
      activeEntity: null,
      stepUpVerifiedUntil: null,
      stepUpMethod: null,
    });

    const req = makeRequest('/api/client-portal/songs/add', {
      eventId: VALID_EVENT_ID,
      title: 'X',
      artist: 'Y',
      tier: 'must_play',
    });
    const res = await addPost(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.step_up_required).toBeUndefined();
    expect(body.reason).toBe('not_authenticated');
  });

  it('rejects an invalid body with 400 (not 401 — validation happens after auth but before step-up)', async () => {
    contextMock.mockReturnValue(VALID_SESSION);
    // step-up approval — this path isn't supposed to reach it
    stepUpMock.mockReturnValue({
      ok: true,
      method: 'otp',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const req = makeRequest('/api/client-portal/songs/add', {
      // eventId missing
      title: 'Umbrella',
      tier: 'must_play',
    });
    const res = await addPost(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.reason).toBe('invalid_body');
  });
});

describe('/api/client-portal/songs/update/[id] — step-up enforcement', () => {
  it('returns 401 step_up_required when no step-up cookie is present', async () => {
    contextMock.mockReturnValue(VALID_SESSION);
    stepUpMock.mockReturnValue({ ok: false, reason: 'missing', required: 'any' });

    const req = makeRequest(`/api/client-portal/songs/update/${VALID_ENTRY_ID}`, {
      eventId: VALID_EVENT_ID,
      tier: 'play_if_possible',
    });
    const res = await updatePost(req, { params: Promise.resolve({ id: VALID_ENTRY_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.step_up_required).toBe(true);
    expect(body.reason).toBe('missing');
  });

  it('rejects a non-UUID entry id with 400 before even checking context', async () => {
    // This check is deliberately before the context lookup — saves a DB
    // round trip on trivially malformed routes.
    const req = makeRequest('/api/client-portal/songs/update/not-a-uuid', {
      eventId: VALID_EVENT_ID,
      tier: 'must_play',
    });
    const res = await updatePost(req, { params: Promise.resolve({ id: 'not-a-uuid' }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.reason).toBe('invalid_entry_id');
  });
});

describe('/api/client-portal/songs/delete/[id] — step-up enforcement', () => {
  it('returns 401 step_up_required when no step-up cookie is present', async () => {
    contextMock.mockReturnValue(VALID_SESSION);
    stepUpMock.mockReturnValue({ ok: false, reason: 'missing', required: 'any' });

    const req = makeRequest(`/api/client-portal/songs/delete/${VALID_ENTRY_ID}`, {
      eventId: VALID_EVENT_ID,
    });
    const res = await deletePost(req, { params: Promise.resolve({ id: VALID_ENTRY_ID }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.step_up_required).toBe(true);
    expect(body.reason).toBe('missing');
  });

  it('rejects a non-UUID entry id with 400', async () => {
    const req = makeRequest('/api/client-portal/songs/delete/not-a-uuid', {
      eventId: VALID_EVENT_ID,
    });
    const res = await deletePost(req, { params: Promise.resolve({ id: 'not-a-uuid' }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.reason).toBe('invalid_entry_id');
  });
});

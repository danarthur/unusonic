import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, createQueryBuilder } from '../../../../../tests/mocks/supabase';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));

const { createClient } = await import('@/shared/api/supabase/server');
const { getCalendarEvents } = await import('../get-events');

type MockClient = ReturnType<typeof createMockSupabaseClient>;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_INPUT = {
  start: '2026-04-01T00:00:00Z',
  end: '2026-04-30T23:59:59Z',
  workspaceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
};

function makeEventRow(overrides: Partial<{
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  project: { workspace_id: string; name: string } | null;
}> = {}) {
  return {
    id: overrides.id ?? 'evt-1',
    title: overrides.title ?? 'Show at The Roxy',
    starts_at: overrides.starts_at ?? '2026-04-15T19:00:00Z',
    ends_at: overrides.ends_at ?? '2026-04-15T23:00:00Z',
    project: overrides.project ?? {
      workspace_id: VALID_INPUT.workspaceId,
      name: 'Spring Tour',
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getCalendarEvents', () => {
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    vi.mocked(createClient).mockResolvedValue(mockClient as any);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Validation
  // ───────────────────────────────────────────────────────────────────────────

  it('returns [] for invalid input', async () => {
    const result = await getCalendarEvents({
      start: '',
      end: '',
      workspaceId: 'bad',
    });
    expect(result).toEqual([]);
    // Should never reach Supabase
    expect(createClient).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Auth guard
  // ───────────────────────────────────────────────────────────────────────────

  it('returns [] when not authenticated', async () => {
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'not authed' },
    } as any);

    const result = await getCalendarEvents(VALID_INPUT);
    expect(result).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Happy path — transformed events
  // ───────────────────────────────────────────────────────────────────────────

  it('returns transformed events on success', async () => {
    const row = makeEventRow();

    mockClient.schema.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const qb = createQueryBuilder();
        qb.then.mockImplementation((resolve: any) =>
          resolve({ data: [row], error: null }),
        );
        return qb;
      }),
    }));

    const result = await getCalendarEvents(VALID_INPUT);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'evt-1',
      title: 'Show at The Roxy',
      start: '2026-04-15T19:00:00Z',
      end: '2026-04-15T23:00:00Z',
      status: 'planned',
      projectTitle: 'Spring Tour',
      color: 'blue',
      workspaceId: VALID_INPUT.workspaceId,
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Query error
  // ───────────────────────────────────────────────────────────────────────────

  it('returns [] on query error', async () => {
    mockClient.schema.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const qb = createQueryBuilder();
        qb.then.mockImplementation((resolve: any) =>
          resolve({ data: null, error: { message: 'timeout' } }),
        );
        return qb;
      }),
    }));

    const result = await getCalendarEvents(VALID_INPUT);
    expect(result).toEqual([]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Null project filtering
  // ───────────────────────────────────────────────────────────────────────────

  it('filters out events with null project', async () => {
    const rows = [
      makeEventRow({ id: 'good', project: { workspace_id: VALID_INPUT.workspaceId, name: 'Tour' } }),
      { id: 'orphan', title: 'Orphan Event', starts_at: '2026-04-10T10:00:00Z', ends_at: '2026-04-10T14:00:00Z' },
    ];

    mockClient.schema.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const qb = createQueryBuilder();
        qb.then.mockImplementation((resolve: any) =>
          resolve({ data: rows, error: null }),
        );
        return qb;
      }),
    }));

    const result = await getCalendarEvents(VALID_INPUT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('good');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Sort order
  // ───────────────────────────────────────────────────────────────────────────

  it('sorts by start date', async () => {
    const rows = [
      makeEventRow({ id: 'c', starts_at: '2026-04-20T10:00:00Z', ends_at: '2026-04-20T14:00:00Z' }),
      makeEventRow({ id: 'a', starts_at: '2026-04-05T10:00:00Z', ends_at: '2026-04-05T14:00:00Z' }),
      makeEventRow({ id: 'b', starts_at: '2026-04-12T10:00:00Z', ends_at: '2026-04-12T14:00:00Z' }),
    ];

    mockClient.schema.mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const qb = createQueryBuilder();
        qb.then.mockImplementation((resolve: any) =>
          resolve({ data: rows, error: null }),
        );
        return qb;
      }),
    }));

    const result = await getCalendarEvents(VALID_INPUT);

    expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});

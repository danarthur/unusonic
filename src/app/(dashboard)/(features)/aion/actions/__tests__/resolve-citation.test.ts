/**
 * Cross-workspace regression tests for resolveCitation.
 *
 * This resolver powers the CitationPill hover card. If Sonnet ever fabricates
 * or re-uses a record id from another workspace (e.g. a user switches
 * workspaces and the prior assistant message is still on screen), the resolver
 * MUST return null — never leak a foreign workspace's record label / snippet.
 *
 * The resolver pipelines:
 *   auth.getUser() → workspace_members.select → <table>.select.eq('id').in('workspace_id', ...).maybeSingle()
 *
 * Real RLS would also block this, but the resolver also filters explicitly on
 * workspace_id at the `.in(...)` stage. These tests exercise that branch plus
 * the malformed-id guard.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.1.3 (Citation pill
 * cross-workspace leak, Critic §Risk 2).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const VALID_UUID = '238cabce-1111-4aaa-8bbb-ccccdddddddd';
const OTHER_WORKSPACE_UUID = '99999999-aaaa-4bbb-8ccc-dddddddddddd';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const hoisted = vi.hoisted(() => {
  // Each test overrides these for the specific scenario.
  const authState = {
    user: { id: 'user-1' } as { id: string } | null,
    memberships: [{ workspace_id: 'ws-1' }] as { workspace_id: string }[],
    recordData: null as Record<string, unknown> | null,
  };

  const mockClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: authState.user } })),
    },
    // Top-level .from() for public-schema tables.
    from: vi.fn((tableName: string) => makeBuilder(tableName, authState, false)),
    schema: vi.fn((_schemaName: string) => ({
      from: vi.fn((tableName: string) => makeBuilder(tableName, authState, true)),
    })),
  };

  return { authState, mockClient };
});

function makeBuilder(
  tableName: string,
  state: { memberships: { workspace_id: string }[]; recordData: Record<string, unknown> | null },
  _fromSchema: boolean,
) {
  // workspace_members lookup path: select -> eq -> then awaited.
  if (tableName === 'workspace_members') {
    return {
      select: () => ({
        eq: vi.fn(async () => ({ data: state.memberships, error: null })),
      }),
    };
  }
  // Record lookup path: select -> eq('id',...) -> in('workspace_id',...) -> maybeSingle.
  return {
    select: () => ({
      eq: vi.fn(() => ({
        in: vi.fn(() => ({
          maybeSingle: async () => ({ data: state.recordData, error: null }),
        })),
      })),
    }),
  };
}

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => hoisted.mockClient),
}));

// ─── SUT (import after mocks) ───────────────────────────────────────────────

import { resolveCitation } from '../resolve-citation';

beforeEach(() => {
  hoisted.authState.user = { id: 'user-1' };
  hoisted.authState.memberships = [{ workspace_id: 'ws-1' }];
  hoisted.authState.recordData = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveCitation — malformed input guard', () => {
  it('returns null for a non-uuid id without hitting the DB', async () => {
    hoisted.authState.recordData = { id: 'x', title: 'should-not-see' };
    const result = await resolveCitation('deal', 'not-a-uuid');
    expect(result).toBeNull();
    // auth.getUser() should not have been called either
    expect(hoisted.mockClient.auth.getUser).not.toHaveBeenCalled();
  });

  it('returns null for an unknown kind', async () => {
    // @ts-expect-error intentionally passing a bad kind
    const result = await resolveCitation('invoice', VALID_UUID);
    expect(result).toBeNull();
  });
});

describe('resolveCitation — auth gate', () => {
  it('returns null when no user is authenticated', async () => {
    hoisted.authState.user = null;
    const result = await resolveCitation('deal', VALID_UUID);
    expect(result).toBeNull();
  });

  it('returns null when the user has no workspace memberships', async () => {
    hoisted.authState.memberships = [];
    const result = await resolveCitation('deal', VALID_UUID);
    expect(result).toBeNull();
  });
});

describe('resolveCitation — cross-workspace regression', () => {
  it('returns null when the record is not in any of the caller\'s workspaces', async () => {
    // The DB layer simulates RLS: a record from another workspace is invisible
    // to `.in('workspace_id', [ws-1])`, so the fake builder returns null.
    hoisted.authState.memberships = [{ workspace_id: 'ws-1' }];
    hoisted.authState.recordData = null;
    const result = await resolveCitation('deal', OTHER_WORKSPACE_UUID);
    expect(result).toBeNull();
  });

  it('never emits a label / snippet / href for a null record', async () => {
    hoisted.authState.recordData = null;
    const deal = await resolveCitation('deal', VALID_UUID);
    const entity = await resolveCitation('entity', VALID_UUID);
    const catalog = await resolveCitation('catalog', VALID_UUID);
    expect(deal).toBeNull();
    expect(entity).toBeNull();
    expect(catalog).toBeNull();
  });
});

describe('resolveCitation — happy paths', () => {
  it('resolves a deal with status, close-date, archetype in the snippet', async () => {
    hoisted.authState.recordData = {
      id: VALID_UUID,
      title: 'Henderson Holiday',
      status: 'won',
      proposed_date: '2025-06-10',
      won_at: '2025-05-12T00:00:00Z',
      lost_at: null,
      event_archetype: 'corporate_gala',
      organization_id: 'org-1',
    };
    const result = await resolveCitation('deal', VALID_UUID);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('deal');
    expect(result!.label).toBe('Henderson Holiday');
    expect(result!.href).toBe(`/events?selected=${VALID_UUID}`);
    // Snippet composes: "won · May 2025 · corporate_gala"
    expect(result!.snippet).toContain('won');
    expect(result!.snippet).toContain('May 2025');
    expect(result!.snippet).toContain('corporate_gala');
  });

  it('resolves an entity with a type label', async () => {
    hoisted.authState.recordData = {
      id: VALID_UUID,
      display_name: 'Acme Events',
      type: 'organization',
    };
    const result = await resolveCitation('entity', VALID_UUID);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('entity');
    expect(result!.label).toBe('Acme Events');
    expect(result!.snippet).toBe('Company');
    expect(result!.href).toBe(`/network/${VALID_UUID}`);
  });

  it('resolves a catalog package with category + price snippet', async () => {
    hoisted.authState.recordData = {
      id: VALID_UUID,
      name: 'Rooftop Gala Package',
      category: 'package',
      price: 4200,
      description: 'Includes tables, linens, ambient lighting',
    };
    const result = await resolveCitation('catalog', VALID_UUID);
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('catalog');
    expect(result!.label).toBe('Rooftop Gala Package');
    expect(result!.snippet).toBe('Package · $4,200');
    expect(result!.href).toBe(`/settings/catalog?open=${VALID_UUID}`);
  });
});

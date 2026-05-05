/**
 * Unit tests for migrateCallerDealSessionToEvent — the Phase 3 §3.6 glue
 * between handoverDeal and cortex.migrate_session_scope.
 *
 * The RPC itself (with its four RAISE branches + collision resolution +
 * orphaned proactive-line re-linking) is covered by the DB-layer migration
 * and its inline safety audit. These tests focus on the JS wrapper's
 * contract:
 *
 *   1. Finds the caller's active deal-scoped session via the correct filter
 *      (scope_type='deal' + scope_entity_id=dealId + archived_at IS NULL).
 *   2. Calls cortex.migrate_session_scope with {session_id, 'event', eventId}.
 *   3. Returns silently (NEVER throws) when:
 *      - No authed user
 *      - No matching deal-scoped session
 *      - RPC returns an error
 *      - Anything in the query chain throws unexpectedly
 *
 * The "never throws" contract is the R6 rule — handoverDeal depends on it
 * to treat Aion as a post-effect, not a critical path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock state (hoisted so vi.mock factories can read it) ────────────────

const hoisted = vi.hoisted(() => {
  const state = {
    user: null as { id: string } | null,
    sessionRow: null as { id: string } | null,
    rpcError: null as { message: string } | null,
    sessionLookupThrows: false,
    rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
    sentryErrors: [] as Array<{ key: string; payload: Record<string, unknown> }>,
  };
  return { state };
});

// Track the filter chain so we can assert the right .eq() calls were made.
const chainCalls: Array<{ method: string; args: unknown[] }> = [];

function makeSelectChain() {
  const chain = {
    select: vi.fn(function (this: unknown, ...a: unknown[]) {
      chainCalls.push({ method: 'select', args: a });
      return chain;
    }),
    eq: vi.fn(function (this: unknown, ...a: unknown[]) {
      chainCalls.push({ method: 'eq', args: a });
      return chain;
    }),
    is: vi.fn(function (this: unknown, ...a: unknown[]) {
      chainCalls.push({ method: 'is', args: a });
      return chain;
    }),
    order: vi.fn(function (this: unknown, ...a: unknown[]) {
      chainCalls.push({ method: 'order', args: a });
      return chain;
    }),
    limit: vi.fn(function (this: unknown, ...a: unknown[]) {
      chainCalls.push({ method: 'limit', args: a });
      return chain;
    }),
    maybeSingle: vi.fn(async () => {
      if (hoisted.state.sessionLookupThrows) {
        throw new Error('simulated lookup crash');
      }
      return { data: hoisted.state.sessionRow, error: null };
    }),
  };
  return chain;
}

vi.mock('@sentry/nextjs', () => ({
  logger: {
    error: (key: string, payload: Record<string, unknown>) => {
      hoisted.state.sentryErrors.push({ key, payload });
    },
  },
}));

function makeClient() {
  const schemaCortex = {
    from: vi.fn(() => makeSelectChain()),
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      hoisted.state.rpcCalls.push({ fn, args });
      return { data: null, error: hoisted.state.rpcError };
    }),
  };
  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: hoisted.state.user } })),
    },
    schema: vi.fn(() => schemaCortex),
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

import { migrateCallerDealSessionToEvent } from '../migrate-deal-session-to-event';

const DEAL_ID = '11111111-1111-4111-a111-111111111111';
const EVENT_ID = '22222222-2222-4222-b222-222222222222';
const WORKSPACE_ID = '33333333-3333-4333-c333-333333333333';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const SESSION_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

beforeEach(() => {
  hoisted.state.user = null;
  hoisted.state.sessionRow = null;
  hoisted.state.rpcError = null;
  hoisted.state.sessionLookupThrows = false;
  hoisted.state.rpcCalls = [];
  hoisted.state.sentryErrors = [];
  chainCalls.length = 0;
});

describe('migrateCallerDealSessionToEvent', () => {
  it('calls migrate_session_scope with the right args when a deal session exists', async () => {
    hoisted.state.user = { id: USER_ID };
    hoisted.state.sessionRow = { id: SESSION_ID };
    const client = makeClient();

    await migrateCallerDealSessionToEvent(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal Supabase client stub for this unit test
      client as any,
      DEAL_ID,
      EVENT_ID,
      WORKSPACE_ID,
    );

    expect(hoisted.state.rpcCalls).toHaveLength(1);
    expect(hoisted.state.rpcCalls[0]).toEqual({
      fn: 'migrate_session_scope',
      args: {
        p_session_id: SESSION_ID,
        p_new_scope_type: 'event',
        p_new_scope_entity_id: EVENT_ID,
      },
    });
    expect(hoisted.state.sentryErrors).toHaveLength(0);
  });

  it('filters the session lookup by scope_type=deal + scope_entity_id + archived_at IS NULL', async () => {
    hoisted.state.user = { id: USER_ID };
    hoisted.state.sessionRow = { id: SESSION_ID };
    const client = makeClient();

    await migrateCallerDealSessionToEvent(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
      client as any,
      DEAL_ID,
      EVENT_ID,
      WORKSPACE_ID,
    );

    const eqCalls = chainCalls.filter((c) => c.method === 'eq');
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['user_id', USER_ID] });
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['workspace_id', WORKSPACE_ID] });
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['scope_type', 'deal'] });
    expect(eqCalls).toContainEqual({ method: 'eq', args: ['scope_entity_id', DEAL_ID] });

    const isCalls = chainCalls.filter((c) => c.method === 'is');
    expect(isCalls).toContainEqual({ method: 'is', args: ['archived_at', null] });
  });

  it('returns silently when no authed user (never throws, never calls RPC)', async () => {
    hoisted.state.user = null;
    const client = makeClient();

    await expect(
      migrateCallerDealSessionToEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
        client as any,
        DEAL_ID,
        EVENT_ID,
        WORKSPACE_ID,
      ),
    ).resolves.toBeUndefined();

    expect(hoisted.state.rpcCalls).toHaveLength(0);
    expect(hoisted.state.sentryErrors).toHaveLength(0);
  });

  it('returns silently when no deal-scoped session exists (never throws)', async () => {
    hoisted.state.user = { id: USER_ID };
    hoisted.state.sessionRow = null;
    const client = makeClient();

    await expect(
      migrateCallerDealSessionToEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
        client as any,
        DEAL_ID,
        EVENT_ID,
        WORKSPACE_ID,
      ),
    ).resolves.toBeUndefined();

    expect(hoisted.state.rpcCalls).toHaveLength(0);
    expect(hoisted.state.sentryErrors).toHaveLength(0);
  });

  it('logs to Sentry when the RPC returns an error, but never throws', async () => {
    hoisted.state.user = { id: USER_ID };
    hoisted.state.sessionRow = { id: SESSION_ID };
    hoisted.state.rpcError = { message: 'session not found' };
    const client = makeClient();

    await expect(
      migrateCallerDealSessionToEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
        client as any,
        DEAL_ID,
        EVENT_ID,
        WORKSPACE_ID,
      ),
    ).resolves.toBeUndefined();

    expect(hoisted.state.rpcCalls).toHaveLength(1);
    expect(hoisted.state.sentryErrors).toHaveLength(1);
    expect(hoisted.state.sentryErrors[0].key).toBe('crm.handoverDeal.aionSessionMigrateFailed');
    expect(hoisted.state.sentryErrors[0].payload.error).toBe('session not found');
    expect(hoisted.state.sentryErrors[0].payload.sessionId).toBe(SESSION_ID);
  });

  it('swallows unexpected query crashes (R6 — handover never aborts on Aion)', async () => {
    hoisted.state.user = { id: USER_ID };
    hoisted.state.sessionLookupThrows = true;
    const client = makeClient();

    await expect(
      migrateCallerDealSessionToEvent(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub
        client as any,
        DEAL_ID,
        EVENT_ID,
        WORKSPACE_ID,
      ),
    ).resolves.toBeUndefined();

    expect(hoisted.state.rpcCalls).toHaveLength(0);
    expect(hoisted.state.sentryErrors).toHaveLength(1);
    expect(hoisted.state.sentryErrors[0].key).toBe('crm.handoverDeal.aionSessionMigrateThrew');
  });
});

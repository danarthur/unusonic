/**
 * Phase 3c dispatcher unit tests.
 *
 * Covers the dispatcher's behavior around claimed rows — not DB interaction.
 * The Supabase client is mocked via `vi.fn()`; the registry is reset and
 * seeded with stub primitives per-test via `__resetRegistryForTests`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';

import {
  __resetRegistryForTests,
  registerPrimitive,
} from '../registry';
import type { TriggerPrimitive } from '../types';
import {
  dispatchPendingTransitions,
  type ClaimedTransitionRow,
} from '../dispatch';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<ClaimedTransitionRow> = {}): ClaimedTransitionRow {
  return {
    transition_id: 't1',
    workspace_id: 'ws1',
    deal_id: 'deal1',
    pipeline_id: 'pipe1',
    from_stage_id: 'stage0',
    to_stage_id: 'stage1',
    actor_user_id: 'user1',
    actor_kind: 'user',
    entered_at: '2026-04-17T12:00:00Z',
    stage_triggers: [],
    stage_slug: 'inquiry',
    stage_kind: 'working',
    stage_tags: [],
    dedup_skip: false,
    ...overrides,
  } as ClaimedTransitionRow;
}

/** Build a stub primitive that returns a fixed result. */
function buildPrimitive(type: string, behavior: 'ok' | 'fail' | 'throw'): TriggerPrimitive<{ n?: number }> {
  return {
    type,
    tier: 'internal',
    label: `stub ${type}`,
    description: 'stub primitive for dispatcher tests',
    configSchema: z.object({ n: z.number().optional() }),
    async run() {
      if (behavior === 'throw') throw new Error(`${type} blew up`);
      if (behavior === 'fail') return { ok: false, error: `${type} returned failure`, retryable: false };
      return { ok: true, summary: `${type} stub fired`, undoToken: `undo-${type}` };
    },
  };
}

/**
 * Builds a minimal SupabaseClient-shaped mock that routes `rpc(name, args)`
 * calls to per-name handlers. Captures calls for assertion.
 */
type RpcHandler = (args: unknown) => { data?: unknown; error?: { message: string } | null };

type MockDbCall = { name: string; args: unknown };

function buildMockDb(handlers: Record<string, RpcHandler>) {
  const calls: MockDbCall[] = [];
  const rpc = vi.fn((name: string, args: unknown) => {
    calls.push({ name, args });
    const handler = handlers[name];
    if (!handler) return Promise.resolve({ data: null, error: null });
    const result = handler(args);
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  });
  // The dispatcher routes ops.* RPCs through `.schema('ops').rpc(...)`.
  // The schema accessor returns a new client-shaped object with its own rpc().
  const schemaClient = { rpc };
  const schema = vi.fn(() => schemaClient);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { db: { rpc, schema } as any, calls, rpc };
}

// Helper — find only the calls to a given RPC name
function callsFor(calls: MockDbCall[], name: string) {
  return calls.filter((c) => c.name === name);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('dispatchPendingTransitions', () => {
  beforeEach(() => {
    __resetRegistryForTests();
  });

  it('empty triggers array → stamps dispatched, no activity log written', async () => {
    const row = makeRow({ stage_triggers: [] });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.claimed).toBe(1);
    expect(summary.processed).toBe(1);
    expect(summary.no_trigger).toBe(1);
    expect(summary.success_triggers).toBe(0);
    expect(summary.failed_triggers).toBe(0);
    expect(callsFor(calls, 'log_deal_activity')).toHaveLength(0);
    expect(callsFor(calls, 'mark_transition_dispatched')).toHaveLength(1);
    expect(callsFor(calls, 'mark_transition_failed')).toHaveLength(0);
  });

  it('dedup_skip → stamps dispatched, writes one pending activity entry', async () => {
    const row = makeRow({
      dedup_skip: true,
      stage_triggers: [{ type: 'notify_role', config: {} }],
    });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      log_deal_activity: () => ({ data: 'log-id' }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.dedup_skipped).toBe(1);
    expect(summary.processed).toBe(1);
    expect(summary.success_triggers).toBe(0);
    expect(summary.failed_triggers).toBe(0);

    const logCalls = callsFor(calls, 'log_deal_activity');
    expect(logCalls).toHaveLength(1);
    const args = logCalls[0].args as Record<string, unknown>;
    expect(args.p_status).toBe('pending');
    expect(args.p_trigger_type).toBeUndefined();
    expect(args.p_action_summary).toMatch(/re-entered/i);
    expect(callsFor(calls, 'mark_transition_dispatched')).toHaveLength(1);
  });

  it('unknown trigger type → logs failed, continues, dispatched stamped once', async () => {
    registerPrimitive(buildPrimitive('known_good', 'ok'));

    const row = makeRow({
      stage_triggers: [
        { type: 'bogus_type', config: {} },
        { type: 'known_good', config: {} },
      ],
    });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      log_deal_activity: () => ({ data: 'log-id' }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.failed_triggers).toBe(1);
    expect(summary.success_triggers).toBe(1);

    const logCalls = callsFor(calls, 'log_deal_activity');
    expect(logCalls).toHaveLength(2);
    const failedArgs = logCalls[0].args as Record<string, unknown>;
    expect(failedArgs.p_status).toBe('failed');
    expect(failedArgs.p_trigger_type).toBe('bogus_type');
    expect(failedArgs.p_error_message).toMatch(/unknown trigger type/i);

    const successArgs = logCalls[1].args as Record<string, unknown>;
    expect(successArgs.p_status).toBe('success');

    // Dispatched stamped exactly once at the end of the row.
    expect(callsFor(calls, 'mark_transition_dispatched')).toHaveLength(1);
  });

  it('Zod config validation failure → logs failed, continues', async () => {
    const strictSchema: TriggerPrimitive<{ required: string }> = {
      type: 'strict',
      tier: 'internal',
      label: 'strict',
      description: 'requires a string field',
      configSchema: z.object({ required: z.string() }),
      async run() {
        return { ok: true, summary: 'ran' };
      },
    };
    registerPrimitive(strictSchema);

    const row = makeRow({
      stage_triggers: [{ type: 'strict', config: { required: 123 } }],
    });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      log_deal_activity: () => ({ data: 'log-id' }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.failed_triggers).toBe(1);
    expect(summary.success_triggers).toBe(0);
    const logArgs = (callsFor(calls, 'log_deal_activity')[0]!.args) as Record<string, unknown>;
    expect(logArgs.p_status).toBe('failed');
    expect(logArgs.p_action_summary).toMatch(/invalid config/i);
  });

  it('primitive run returns ok:true → logs success activity with summary + undoToken', async () => {
    registerPrimitive(buildPrimitive('task_pr', 'ok'));

    const row = makeRow({
      stage_triggers: [{ type: 'task_pr', config: {} }],
    });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      log_deal_activity: () => ({ data: 'log-id' }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.success_triggers).toBe(1);
    expect(summary.failed_triggers).toBe(0);
    const logArgs = (callsFor(calls, 'log_deal_activity')[0]!.args) as Record<string, unknown>;
    expect(logArgs.p_status).toBe('success');
    expect(logArgs.p_trigger_type).toBe('task_pr');
    expect(logArgs.p_action_summary).toBe('task_pr stub fired');
    expect(logArgs.p_undo_token).toBe('undo-task_pr');
  });

  it('primitive run returns ok:false → logs failed activity', async () => {
    registerPrimitive(buildPrimitive('bad_one', 'fail'));

    const row = makeRow({
      stage_triggers: [{ type: 'bad_one', config: {} }],
    });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      log_deal_activity: () => ({ data: 'log-id' }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.success_triggers).toBe(0);
    expect(summary.failed_triggers).toBe(1);
    const logArgs = (callsFor(calls, 'log_deal_activity')[0]!.args) as Record<string, unknown>;
    expect(logArgs.p_status).toBe('failed');
    expect(logArgs.p_error_message).toBe('bad_one returned failure');
  });

  it('primitive throws → logs failed activity with thrown error message', async () => {
    registerPrimitive(buildPrimitive('thrower', 'throw'));

    const row = makeRow({
      stage_triggers: [{ type: 'thrower', config: {} }],
    });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      log_deal_activity: () => ({ data: 'log-id' }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.failed_triggers).toBe(1);
    const logArgs = (callsFor(calls, 'log_deal_activity')[0]!.args) as Record<string, unknown>;
    expect(logArgs.p_status).toBe('failed');
    expect(logArgs.p_error_message).toMatch(/blew up/);
  });

  it('multiple triggers in one transition all run; dispatched stamped once', async () => {
    registerPrimitive(buildPrimitive('alpha', 'ok'));
    registerPrimitive(buildPrimitive('beta', 'ok'));
    registerPrimitive(buildPrimitive('gamma', 'fail'));

    const row = makeRow({
      stage_triggers: [
        { type: 'alpha', config: {} },
        { type: 'beta', config: {} },
        { type: 'gamma', config: {} },
      ],
    });
    const { db, calls } = buildMockDb({
      claim_pending_transitions: () => ({ data: [row] }),
      log_deal_activity: () => ({ data: 'log-id' }),
      mark_transition_dispatched: () => ({ data: null }),
    });

    const summary = await dispatchPendingTransitions(db);

    expect(summary.success_triggers).toBe(2);
    expect(summary.failed_triggers).toBe(1);
    expect(callsFor(calls, 'log_deal_activity')).toHaveLength(3);
    expect(callsFor(calls, 'mark_transition_dispatched')).toHaveLength(1);
    expect(callsFor(calls, 'mark_transition_failed')).toHaveLength(0);
  });
});

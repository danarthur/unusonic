/**
 * Unit tests for the enroll_in_follow_up primitive (P0 follow-up engine).
 *
 * Tests the primitive's in-memory behavior — schema validation, dedup
 * handling, channel resolver fallback. DB I/O is mocked; the DB-level
 * unique-index behavior is covered by a separate integration test that
 * touches a live Supabase branch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { TriggerContext } from '../types';

// Module under test is dynamically imported per-test so we can swap out
// the getSystemClient mock cleanly.
vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: vi.fn(),
}));

import * as systemModule from '@/shared/api/supabase/system';

type InsertSpy = ReturnType<typeof vi.fn>;
type SchemaSpy = ReturnType<typeof vi.fn>;

function makeCtx(overrides: Partial<Extract<TriggerContext, { source: 'stage_trigger' }>> = {}): TriggerContext {
  return {
    source: 'stage_trigger',
    transitionId: 'tr-1',
    dealId: 'deal-1',
    workspaceId: 'ws-1',
    actorUserId: null,
    actorKind: 'system',
    primitiveKey: 'seed:nudge_client',
    event: 'on_enter',
    ...overrides,
  };
}

function wireSystemClient({
  insertResult,
  entityMemoryFacts = [],
  organizationId = null,
}: {
  insertResult: { error: { code?: string; message: string } | null };
  entityMemoryFacts?: Array<{ fact: string; updated_at: string }>;
  organizationId?: string | null;
}): InsertSpy {
  const insertFn: InsertSpy = vi.fn().mockResolvedValue(insertResult);

  const dealLookupMaybeSingle = vi
    .fn()
    .mockResolvedValue({
      data: organizationId ? { organization_id: organizationId } : null,
      error: null,
    });

  const aionMemoryChain = {
    select: () => aionMemoryChain,
    eq: () => aionMemoryChain,
    ilike: () => aionMemoryChain,
    order: () => aionMemoryChain,
    limit: () => Promise.resolve({ data: entityMemoryFacts, error: null }),
  };

  const followUpQueueChain = {
    insert: insertFn,
  };

  const dealsChain = {
    select: () => dealsChain,
    eq: () => dealsChain,
    maybeSingle: dealLookupMaybeSingle,
  };

  const fromFn = vi.fn((table: string) => {
    if (table === 'follow_up_queue') return followUpQueueChain;
    if (table === 'aion_memory') return aionMemoryChain;
    throw new Error(`Unexpected table in test: ${table}`);
  });

  const schemaFn: SchemaSpy = vi.fn(() => ({ from: fromFn }));

  const client = {
    from: vi.fn(() => dealsChain),
    schema: schemaFn,
  };

  (systemModule.getSystemClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(client);

  return insertFn;
}

describe('enrollInFollowUpPrimitive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('inserts a pending row with the expected shape on a fresh transition', async () => {
    const insertFn = wireSystemClient({ insertResult: { error: null } });
    const { enrollInFollowUpPrimitive } = await import('../primitives/enroll-follow-up');

    const parsed = enrollInFollowUpPrimitive.configSchema.parse({
      reason_type: 'nudge_client',
      dwell_days: 3,
      channel: 'email',
    });
    const result = await enrollInFollowUpPrimitive.run(parsed, makeCtx());

    expect(result.ok).toBe(true);
    expect(insertFn).toHaveBeenCalledOnce();
    const insertArg = insertFn.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.reason_type).toBe('nudge_client');
    expect(insertArg.suggested_channel).toBe('email');
    expect(insertArg.originating_transition_id).toBe('tr-1');
    expect(insertArg.primitive_key).toBe('seed:nudge_client');
    expect(insertArg.hide_from_portal).toBe(true);
    expect(insertArg.status).toBe('pending');
  });

  it('treats a duplicate-key violation as a successful no-op', async () => {
    const insertFn = wireSystemClient({
      insertResult: {
        error: {
          code: '23505',
          message: 'duplicate key value violates unique constraint "follow_up_queue_transition_primitive_uniq"',
        },
      },
    });
    const { enrollInFollowUpPrimitive } = await import('../primitives/enroll-follow-up');

    const parsed = enrollInFollowUpPrimitive.configSchema.parse({
      reason_type: 'check_in',
    });
    const result = await enrollInFollowUpPrimitive.run(parsed, makeCtx());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.summary).toContain('deduped');
    expect(insertFn).toHaveBeenCalledOnce();
  });

  it('falls back to email when no entity preference and no trigger channel', async () => {
    const insertFn = wireSystemClient({ insertResult: { error: null } });
    const { enrollInFollowUpPrimitive } = await import('../primitives/enroll-follow-up');

    const parsed = enrollInFollowUpPrimitive.configSchema.parse({
      reason_type: 'gone_quiet',
      // channel deliberately omitted
    });
    await enrollInFollowUpPrimitive.run(parsed, makeCtx());

    const insertArg = insertFn.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.suggested_channel).toBe('email');
  });

  it('prefers entity aion_memory preference over trigger config channel', async () => {
    const insertFn = wireSystemClient({
      insertResult: { error: null },
      organizationId: 'org-1',
      entityMemoryFacts: [{ fact: 'channel:sms', updated_at: '2026-04-17T00:00:00Z' }],
    });
    const { enrollInFollowUpPrimitive } = await import('../primitives/enroll-follow-up');

    const parsed = enrollInFollowUpPrimitive.configSchema.parse({
      reason_type: 'nudge_client',
      channel: 'email',
    });
    await enrollInFollowUpPrimitive.run(parsed, makeCtx());

    const insertArg = insertFn.mock.calls[0][0] as Record<string, unknown>;
    expect(insertArg.suggested_channel).toBe('sms');
  });

  it('rejects configs missing reason_type at the schema layer', async () => {
    const { enrollInFollowUpPrimitive } = await import('../primitives/enroll-follow-up');
    expect(() => enrollInFollowUpPrimitive.configSchema.parse({})).toThrow();
  });

  it('returns a readable preview', async () => {
    const { enrollInFollowUpPrimitive } = await import('../primitives/enroll-follow-up');
    const preview = enrollInFollowUpPrimitive.preview?.({
      reason_type: 'check_in',
      dwell_days: 7,
    });
    expect(preview).toBeTruthy();
    expect(preview).toContain('Check in on the proposal');
    expect(preview).toContain('7');
  });
});

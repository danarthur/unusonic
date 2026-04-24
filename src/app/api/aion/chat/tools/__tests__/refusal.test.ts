/**
 * Unit tests for the Phase 3.4 record_refusal tool.
 *
 * Verifies:
 *  - buildRefusalBlock shapes a valid Refusal block (required fields present)
 *  - attempted_metric_id resolves to a registry title when known
 *  - suggestions resolve to registry titles; unknown ids dropped silently
 *  - missing optional args produce a well-formed block (no undefined fields)
 *  - the tool factory calls the record_refusal RPC with the right payload
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the server supabase client (imported transitively for buildRefusalBlock
// via the registry; safe no-op here).
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    schema: () => ({ rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }),
  }),
}));

// Hoisted mocks for the system client — each test re-grabs the rpcSpy from
// the module so we can assert on call args.
const rpcSpy = vi.fn().mockResolvedValue({ data: 'pretend-uuid', error: null });
vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: () => ({
    schema: () => ({ rpc: rpcSpy }),
  }),
}));

import { buildRefusalBlock, createRefusalTools } from '../refusal';

describe('buildRefusalBlock', () => {
  it('shapes a minimal refusal block with only required fields', () => {
    const block = buildRefusalBlock({
      question: 'how many shoes did we ship last month',
      reason: 'metric_not_in_registry',
    });
    expect(block.type).toBe('refusal');
    expect(block.reason).toBe('metric_not_in_registry');
    expect(block.text).toContain("I don't have a defined metric");
    expect(block.attemptedMetricId).toBeUndefined();
    expect(block.attemptedMetricTitle).toBeUndefined();
    // Suggestions default to empty array when not provided.
    expect(Array.isArray(block.suggestions)).toBe(true);
    expect(block.suggestions?.length).toBe(0);
  });

  it('resolves attemptedMetricTitle from the registry when id is known', () => {
    const block = buildRefusalBlock({
      question: 'how much revenue this year',
      reason: 'ambiguous_arg',
      attemptedMetricId: 'finance.revenue_collected',
    });
    expect(block.attemptedMetricId).toBe('finance.revenue_collected');
    expect(block.attemptedMetricTitle).toBe('Revenue collected');
    // Prose subtly changes when a near-match is known.
    expect(block.text).toContain('that exactly');
  });

  it('omits attemptedMetricTitle when the id is not in the registry', () => {
    const block = buildRefusalBlock({
      question: 'test',
      reason: 'other',
      attemptedMetricId: 'made.up.metric',
    });
    expect(block.attemptedMetricId).toBe('made.up.metric');
    expect(block.attemptedMetricTitle).toBeUndefined();
  });

  it('resolves suggestion titles + drops unknown ids', () => {
    const block = buildRefusalBlock({
      question: "revenue this year",
      reason: 'metric_not_in_registry',
      suggestions: ['finance.revenue_collected', 'made.up.one', 'finance.ar_aged_60plus'],
    });
    expect(block.suggestions?.length).toBe(2);
    expect(block.suggestions?.map((c) => c.label)).toContain('Revenue collected');
    expect(block.suggestions?.map((c) => c.label)).toContain('AR aged 60+ days');
    // Chip value is a natural-language retry the chat pipeline will handle
    // as a new user turn.
    expect(block.suggestions?.[0].value.toLowerCase()).toContain('show me');
  });

  it('caps suggestions at 3', () => {
    const block = buildRefusalBlock({
      question: 'a',
      reason: 'other',
      suggestions: [
        'finance.revenue_collected',
        'finance.ar_aged_60plus',
        'finance.qbo_variance',
        'finance.qbo_sync_health',
        'ops.aion_refusal_rate',
      ],
    });
    // Only the first 3 are considered and resolved.
    expect((block.suggestions ?? []).length).toBeLessThanOrEqual(3);
  });
});

describe('createRefusalTools — record_refusal execute', () => {
  beforeEach(() => {
    rpcSpy.mockClear();
  });

  it('writes a refusal row via the system client + emits a refusal block', async () => {
    const tools = createRefusalTools({
      workspaceId: 'ws-1',
      userId: 'user-1',
      userName: 'Test',
      userRole: 'owner',
      pageContext: null,
      getConfig: () => ({}) as never,
      refreshConfig: async () => {},
      canWrite: true,
      setConfigUpdates: () => {},
    });

    const result = await (tools.record_refusal as unknown as { execute: (p: unknown) => Promise<unknown> }).execute({
      question: 'what is our refund rate',
      reason: 'metric_not_in_registry',
      attempted_metric_id: 'finance.revenue_collected',
      suggestions: ['finance.revenue_collected'],
    });

    // RPC was called with the expected args.
    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [rpcName, args] = rpcSpy.mock.calls[0];
    expect(rpcName).toBe('record_refusal');
    expect(args).toMatchObject({
      p_workspace_id: 'ws-1',
      p_user_id: 'user-1',
      p_question: 'what is our refund rate',
      p_reason: 'metric_not_in_registry',
      p_attempted_metric_id: 'finance.revenue_collected',
    });

    // Tool emits a refusal block.
    expect(result).toHaveProperty('refusal');
    const block = (result as { refusal: { type: string; reason: string; attemptedMetricTitle?: string } }).refusal;
    expect(block.type).toBe('refusal');
    expect(block.reason).toBe('metric_not_in_registry');
    expect(block.attemptedMetricTitle).toBe('Revenue collected');
  });

  it('passes p_attempted_metric_id as null when the caller omits it', async () => {
    const tools = createRefusalTools({
      workspaceId: 'ws-2',
      userId: 'user-2',
      userName: '',
      userRole: 'owner',
      pageContext: null,
      getConfig: () => ({}) as never,
      refreshConfig: async () => {},
      canWrite: true,
      setConfigUpdates: () => {},
    });

    await (tools.record_refusal as unknown as { execute: (p: unknown) => Promise<unknown> }).execute({
      question: 'some out of scope question',
      reason: 'other',
    });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const [, args] = rpcSpy.mock.calls[0];
    // RPC signature types p_attempted_metric_id as string | undefined; the
    // code coerces null → undefined at the call site so TS accepts the call.
    // Semantically equivalent at runtime for this optional arg.
    expect(args.p_attempted_metric_id).toBeUndefined();
  });
});

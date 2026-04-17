import { vi, describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient } from '../../../../tests/mocks/supabase';

// ── Module mocks ───────────────────────────────────────────────────────────
vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/shared/lib/workspace', () => ({
  getActiveWorkspaceId: vi.fn(),
}));

const { createClient } = await import('@/shared/api/supabase/server');
const { getActiveWorkspaceId } = await import('@/shared/lib/workspace');
const { updatePipelineStageTriggers } = await import('../api/actions');

type MockClient = ReturnType<typeof createMockSupabaseClient>;

const STAGE_ID = 'stage-uuid-1';
const WORKSPACE_ID = 'ws-uuid-1';

describe('updatePipelineStageTriggers', () => {
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    vi.mocked(createClient).mockResolvedValue(mockClient as never);
    vi.mocked(getActiveWorkspaceId).mockResolvedValue(WORKSPACE_ID);
    // `member_has_capability` → permitted by default
    vi.mocked(mockClient.rpc).mockResolvedValue({ data: true, error: null } as never);
  });

  // ── Capability gate ─────────────────────────────────────────────────────

  it('rejects when the caller lacks pipelines:manage', async () => {
    vi.mocked(mockClient.rpc).mockResolvedValueOnce({ data: false, error: null } as never);

    const result = await updatePipelineStageTriggers(STAGE_ID, []);
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/permission/i),
    });
  });

  it('rejects when no active workspace', async () => {
    vi.mocked(getActiveWorkspaceId).mockResolvedValueOnce(null as never);

    const result = await updatePipelineStageTriggers(STAGE_ID, []);
    expect(result).toEqual({
      success: false,
      error: expect.stringMatching(/workspace/i),
    });
  });

  // ── Shape validation ────────────────────────────────────────────────────

  it('rejects non-array input', async () => {
    const result = await updatePipelineStageTriggers(
      STAGE_ID,
      // @ts-expect-error — exercising runtime guard
      { not: 'an array' },
    );
    expect(result).toEqual({ success: false, error: expect.stringMatching(/array/i) });
  });

  it('rejects malformed entry missing type', async () => {
    const result = await updatePipelineStageTriggers(STAGE_ID, [
      // @ts-expect-error — exercising runtime guard
      { config: {} },
    ]);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/malformed/i);
  });

  // ── Primitive lookup ────────────────────────────────────────────────────

  it('rejects unknown trigger type', async () => {
    const result = await updatePipelineStageTriggers(STAGE_ID, [
      { type: 'not_a_real_primitive', config: {} },
    ]);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/unknown trigger type/i);
  });

  // ── Zod validation ──────────────────────────────────────────────────────

  it('accepts trigger_handoff with empty config', async () => {
    const result = await updatePipelineStageTriggers(STAGE_ID, [
      { type: 'trigger_handoff', config: {} },
    ]);
    expect(result).toEqual({ success: true, stageId: STAGE_ID });
  });

  it('accepts notify_role with valid config', async () => {
    const result = await updatePipelineStageTriggers(STAGE_ID, [
      { type: 'notify_role', config: { role_slug: 'crew_chief', message: 'heads up' } },
    ]);
    expect(result).toEqual({ success: true, stageId: STAGE_ID });
  });

  it('rejects notify_role missing role_slug with a helpful message', async () => {
    const result = await updatePipelineStageTriggers(STAGE_ID, [
      // Empty config violates the Zod schema (role_slug is required). The
      // TriggerEntry type allows any object so no ts-expect-error is needed.
      { type: 'notify_role', config: {} },
    ]);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/notify_role/);
    expect((result as { error: string }).error).toMatch(/role_slug/);
  });

  it('rejects create_task with invalid assignee_rule enum', async () => {
    const result = await updatePipelineStageTriggers(STAGE_ID, [
      {
        type: 'create_task',
        config: { title: 'do the thing', assignee_rule: 'not_a_valid_role' },
      },
    ]);
    expect(result.success).toBe(false);
    expect((result as { error: string }).error).toMatch(/create_task/);
    expect((result as { error: string }).error).toMatch(/assignee_rule/);
  });

  it('bakes Zod defaults into stored config (send_deposit_invoice)', async () => {
    // Capture the write payload so we can inspect what hit the DB.
    let capturedUpdate: unknown = null;
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.update = vi.fn((payload: unknown) => {
      capturedUpdate = payload;
      return chain;
    });
    chain.eq = vi.fn().mockResolvedValue({ data: null, error: null });
    mockClient.schema = vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue(chain),
    }) as never;

    const result = await updatePipelineStageTriggers(STAGE_ID, [
      // No amount_basis supplied → Zod default 'deposit' should be baked in.
      { type: 'send_deposit_invoice', config: {} },
    ]);

    expect(result).toEqual({ success: true, stageId: STAGE_ID });
    expect(capturedUpdate).toEqual({
      triggers: [
        { type: 'send_deposit_invoice', config: { amount_basis: 'deposit' } },
      ],
    });
  });
});

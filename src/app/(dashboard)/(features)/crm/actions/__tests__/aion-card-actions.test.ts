/**
 * Unit tests for the unified Aion deal card's server actions.
 *
 * The handlers that drive the card (accept/revert/dismiss) must:
 *   - Short-circuit idempotently when the deal has already advanced or
 *     the insight is resolved (P1-4 race guard).
 *   - Thread the insight_id as a suggestion_insight_id through the RPC
 *     so audit logs stay truthful.
 *   - Always emit exactly one aion_card_action event — no legacy double-
 *     write per §10.5.
 *
 * All Supabase + system client calls are mocked. DB-level semantics
 * (the actual trigger behavior) are covered by smoke-tests against the
 * live DB (see commit 96f1fc1 Phase 1 verification).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/shared/api/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/shared/api/supabase/system', () => ({ getSystemClient: vi.fn() }));
vi.mock('@/shared/lib/workspace', () => ({ getActiveWorkspaceId: vi.fn() }));

import * as serverMod from '@/shared/api/supabase/server';
import * as systemMod from '@/shared/api/supabase/system';
import * as workspaceMod from '@/shared/lib/workspace';

const WORKSPACE = 'ws-1';
const DEAL = 'deal-1';
const USER = 'user-1';
const INSIGHT = 'insight-1';
const TARGET_STAGE = 'stage-target';
const PRIOR_STAGE = 'stage-prior';

type AuthedChain = {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

function wireAuthedClient(opts: { user: { id: string } | null; isMember: boolean }): AuthedChain {
  const memberChain: Record<string, ReturnType<typeof vi.fn>> = {};
  memberChain.select = vi.fn(() => memberChain);
  memberChain.eq = vi.fn(() => memberChain);
  memberChain.limit = vi.fn(() => memberChain);
  memberChain.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: opts.isMember ? { workspace_id: WORKSPACE } : null }),
  );

  const authed: AuthedChain = {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: opts.user } })),
    },
    from: vi.fn(() => memberChain),
  };
  (serverMod.createClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(authed);
  return authed;
}

function wireSystemClient(opts: {
  dealStageId: string | null;
  insightStatus: 'pending' | 'surfaced' | 'dismissed' | 'resolved' | null;
  rpcReturn?: string | null;
  rpcError?: { message: string } | null;
  updateError?: { message: string } | null;
}) {
  // public.deals lookup
  const dealsChain: Record<string, ReturnType<typeof vi.fn>> = {};
  dealsChain.select = vi.fn(() => dealsChain);
  dealsChain.eq = vi.fn(() => dealsChain);
  dealsChain.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: opts.dealStageId !== undefined
        ? { stage_id: opts.dealStageId, workspace_id: WORKSPACE }
        : null,
    }),
  );

  // cortex.aion_insights — two distinct sub-chains so SELECT and UPDATE don't collide.
  //   SELECT: .from('aion_insights').select(...).eq().eq().maybeSingle()
  //   UPDATE: .from('aion_insights').update(...).eq().eq()  (awaitable thenable)
  const selectChain: Record<string, ReturnType<typeof vi.fn>> = {};
  selectChain.eq = vi.fn(() => selectChain);
  selectChain.maybeSingle = vi.fn(() =>
    Promise.resolve({
      data: opts.insightStatus ? { id: INSIGHT, status: opts.insightStatus } : null,
    }),
  );

  // The UPDATE chain must be thenable after the last .eq so `await supabase...` resolves.
  const updateResult = { error: opts.updateError ?? null };
  const updateChain: {
    eq: ReturnType<typeof vi.fn>;
    then?: (r: (v: typeof updateResult) => void) => Promise<void>;
  } = {
    eq: vi.fn(),
  };
  updateChain.eq = vi.fn(() => updateChain);
  // Make it awaitable: after two `.eq` calls, `await` lands on the .then below.
  (updateChain as unknown as PromiseLike<typeof updateResult>).then = ((
    resolve?: ((value: typeof updateResult) => unknown) | null,
  ) => Promise.resolve(resolve ? resolve(updateResult) : updateResult) as Promise<unknown>) as PromiseLike<typeof updateResult>['then'];

  const insightsChain: Record<string, ReturnType<typeof vi.fn>> = {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
  };

  // deal_activity_log insert (telemetry) — always succeeds
  const activityChain: Record<string, ReturnType<typeof vi.fn>> = {
    insert: vi.fn(() => Promise.resolve({ error: null })),
  };

  const rpc = vi.fn((name: string) => {
    if (name === 'record_deal_transition_with_actor') {
      return Promise.resolve({
        data: opts.rpcReturn ?? 'txn-1',
        error: opts.rpcError ?? null,
      });
    }
    if (name === 'resolve_aion_insight') {
      return Promise.resolve({ data: true, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  const opsSchema = {
    rpc,
    from: vi.fn((table: string) => (table === 'deal_activity_log' ? activityChain : dealsChain)),
  };
  const cortexSchema = {
    rpc,
    from: () => insightsChain,
  };

  const system = {
    from: vi.fn(() => dealsChain),
    schema: vi.fn((s: string) => (s === 'ops' ? opsSchema : cortexSchema)),
  };

  (systemMod.getSystemClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(system);
  return { rpc, activityInsert: activityChain.insert };
}

describe('acceptAionCardAdvance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (workspaceMod.getActiveWorkspaceId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(WORKSPACE);
  });
  afterEach(() => {
    vi.resetModules();
  });

  it('returns error when no active workspace', async () => {
    (workspaceMod.getActiveWorkspaceId as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    wireAuthedClient({ user: { id: USER }, isMember: true });
    const { acceptAionCardAdvance } = await import('../aion-card-actions');
    const result = await acceptAionCardAdvance(DEAL, INSIGHT, TARGET_STAGE);
    expect(result).toMatchObject({ success: false });
  });

  it('returns error when caller is not a workspace member', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: false });
    const { acceptAionCardAdvance } = await import('../aion-card-actions');
    const result = await acceptAionCardAdvance(DEAL, INSIGHT, TARGET_STAGE);
    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.error).toMatch(/workspace/i);
  });

  it('short-circuits when deal is already at the target stage (noop path)', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: true });
    const { rpc } = wireSystemClient({
      dealStageId: TARGET_STAGE,           // already there
      insightStatus: 'pending',
    });
    const { acceptAionCardAdvance } = await import('../aion-card-actions');
    const result = await acceptAionCardAdvance(DEAL, INSIGHT, TARGET_STAGE);
    expect(result).toEqual({
      success: true,
      transitionId: null,
      priorStageId: TARGET_STAGE,
    });
    // Critical: the RPC must NOT have been called
    expect(rpc).not.toHaveBeenCalledWith('record_deal_transition_with_actor', expect.any(Object));
  });

  it('short-circuits when insight is already resolved (noop path)', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: true });
    const { rpc } = wireSystemClient({
      dealStageId: PRIOR_STAGE,
      insightStatus: 'resolved',
    });
    const { acceptAionCardAdvance } = await import('../aion-card-actions');
    const result = await acceptAionCardAdvance(DEAL, INSIGHT, TARGET_STAGE);
    expect(result).toMatchObject({ success: true, transitionId: null });
    expect(rpc).not.toHaveBeenCalledWith('record_deal_transition_with_actor', expect.any(Object));
  });

  it('happy path: calls RPC with suggestion_insight_id provenance, returns transitionId + priorStageId', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: true });
    const { rpc } = wireSystemClient({
      dealStageId: PRIOR_STAGE,
      insightStatus: 'pending',
    });
    const { acceptAionCardAdvance } = await import('../aion-card-actions');
    const result = await acceptAionCardAdvance(DEAL, INSIGHT, TARGET_STAGE);
    expect(result).toEqual({
      success: true,
      transitionId: 'txn-1',
      priorStageId: PRIOR_STAGE,
    });

    const rpcCall = rpc.mock.calls.find(
      (c) => c[0] === 'record_deal_transition_with_actor',
    );
    expect(rpcCall).toBeDefined();
    const args = (rpcCall as unknown as [string, Record<string, unknown>])[1];
    expect(args).toMatchObject({
      p_deal_id: DEAL,
      p_to_stage_id: TARGET_STAGE,
      p_actor_kind: 'user',
      p_actor_id: USER,
      p_suggestion_insight_id: INSIGHT,
      p_reason: 'aion_suggestion_accepted',
    });

    // Insight resolve also fired (post-advance)
    expect(rpc).toHaveBeenCalledWith('resolve_aion_insight', expect.objectContaining({
      p_trigger_type: 'stage_advance_suggestion',
      p_entity_id: DEAL,
    }));
  });

  it('bubbles RPC errors back to the caller', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: true });
    wireSystemClient({
      dealStageId: PRIOR_STAGE,
      insightStatus: 'pending',
      rpcError: { message: 'deadlock detected' },
    });
    const { acceptAionCardAdvance } = await import('../aion-card-actions');
    const result = await acceptAionCardAdvance(DEAL, INSIGHT, TARGET_STAGE);
    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.error).toMatch(/deadlock/);
  });
});

describe('revertAionCardAdvance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (workspaceMod.getActiveWorkspaceId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(WORKSPACE);
  });

  it('calls RPC with aion_suggestion_reverted reason and actor_kind=user', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: true });
    const { rpc } = wireSystemClient({
      dealStageId: TARGET_STAGE,
      insightStatus: 'resolved',
    });
    const { revertAionCardAdvance } = await import('../aion-card-actions');
    const result = await revertAionCardAdvance(DEAL, PRIOR_STAGE);
    expect(result).toEqual({ success: true });

    const rpcCall = rpc.mock.calls.find(
      (c) => c[0] === 'record_deal_transition_with_actor',
    );
    expect(rpcCall).toBeDefined();
    const args = (rpcCall as unknown as [string, Record<string, unknown>])[1];
    expect(args).toMatchObject({
      p_deal_id: DEAL,
      p_to_stage_id: PRIOR_STAGE,           // back to where we came from
      p_actor_kind: 'user',
      p_actor_id: USER,
      p_reason: 'aion_suggestion_reverted',
    });
  });

  it('returns error when not a workspace member', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: false });
    wireSystemClient({ dealStageId: TARGET_STAGE, insightStatus: 'resolved' });
    const { revertAionCardAdvance } = await import('../aion-card-actions');
    const result = await revertAionCardAdvance(DEAL, PRIOR_STAGE);
    expect(result).toMatchObject({ success: false });
  });
});

describe('dismissAionCardPipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (workspaceMod.getActiveWorkspaceId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(WORKSPACE);
  });

  it('updates insight status to dismissed and returns success', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: true });
    wireSystemClient({
      dealStageId: PRIOR_STAGE,
      insightStatus: 'pending',
    });
    const { dismissAionCardPipeline } = await import('../aion-card-actions');
    const result = await dismissAionCardPipeline(DEAL, INSIGHT);
    expect(result).toEqual({ success: true });
  });

  it('returns error when membership check fails', async () => {
    wireAuthedClient({ user: { id: USER }, isMember: false });
    const { dismissAionCardPipeline } = await import('../aion-card-actions');
    const result = await dismissAionCardPipeline(DEAL, INSIGHT);
    expect(result).toMatchObject({ success: false });
  });
});

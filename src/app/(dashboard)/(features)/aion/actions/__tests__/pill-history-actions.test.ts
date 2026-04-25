/**
 * Wk 10 D7 — pill-history server actions.
 *
 * Functional coverage for the four authenticated RPC wrappers + the
 * service-role read for active workspace disables. Plus a source-discipline
 * integration test enforcing the Wk 10 cross-table boundary: this code path
 * MUST NOT touch cortex.aion_insights — that table belongs to the lobby
 * Daily Brief surface and has its own greeting-identity telemetry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const state = {
    rpcResult: null as unknown,
    rpcError: null as { message: string } | null,
    membershipRow: null as Record<string, unknown> | null,
    membershipError: null as { message: string } | null,
    user: null as { id: string } | null,
    disablesRows: [] as Array<Record<string, unknown>>,
    disablesError: null as { message: string } | null,
  };
  return { state };
});

const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
const fromCalls: string[] = [];

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: async () => ({ data: { user: hoisted.state.user }, error: null }),
    },
    schema: () => ({
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return {
          data: hoisted.state.rpcResult,
          error: hoisted.state.rpcError,
        };
      }),
    }),
    from: (table: string) => {
      fromCalls.push(table);
      const chain = {
        select: () => chain,
        eq:     () => chain,
        maybeSingle: async () => ({
          data: hoisted.state.membershipRow,
          error: hoisted.state.membershipError,
        }),
      };
      return chain;
    },
  })),
}));

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: () => ({
    schema: () => ({
      from: (table: string) => {
        fromCalls.push(`system:${table}`);
        const chain = {
          select: () => chain,
          eq:     () => chain,
          gt:     () => chain,
          order:  async () => ({
            data: hoisted.state.disablesRows,
            error: hoisted.state.disablesError,
          }),
        };
        return chain;
      },
    }),
  }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  getPillHistoryForDeal,
  markPillSeen,
  submitPillFeedback,
  resurfaceMutedReason,
  getActiveSignalDisablesForWorkspace,
} from '../pill-history-actions';

beforeEach(() => {
  hoisted.state.rpcResult = null;
  hoisted.state.rpcError = null;
  hoisted.state.membershipRow = null;
  hoisted.state.membershipError = null;
  hoisted.state.user = { id: 'user-1' };
  hoisted.state.disablesRows = [];
  hoisted.state.disablesError = null;
  rpcCalls.length = 0;
  fromCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getPillHistoryForDeal', () => {
  it('returns rows from cortex.list_aion_proactive_history', async () => {
    hoisted.state.rpcResult = [
      { id: 'p-1', headline: 'Proposal viewed 4x', created_at: '2026-04-22T12:00:00Z' },
    ];
    const result = await getPillHistoryForDeal('deal-1', 7);
    expect(result.rows).toHaveLength(1);
    expect(rpcCalls[0]).toEqual({
      name: 'list_aion_proactive_history',
      args: { p_deal_id: 'deal-1', p_days: 7 },
    });
  });

  it('defaults to 14 days when not specified', async () => {
    hoisted.state.rpcResult = [];
    await getPillHistoryForDeal('deal-1');
    expect(rpcCalls[0].args.p_days).toBe(14);
  });

  it('surfaces RPC errors with empty rows', async () => {
    hoisted.state.rpcResult = null;
    hoisted.state.rpcError = { message: 'Not a workspace member' };
    const result = await getPillHistoryForDeal('deal-1');
    expect(result.rows).toEqual([]);
    expect(result.error).toContain('Not a workspace member');
  });
});

describe('markPillSeen', () => {
  it('calls cortex.mark_pill_seen with the line id', async () => {
    hoisted.state.rpcResult = true;
    const result = await markPillSeen('line-1');
    expect(result.success).toBe(true);
    expect(rpcCalls[0]).toEqual({
      name: 'mark_pill_seen',
      args: { p_line_id: 'line-1' },
    });
  });

  it('returns failure when RPC returns false (not found)', async () => {
    hoisted.state.rpcResult = false;
    const result = await markPillSeen('line-missing');
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});

describe('submitPillFeedback', () => {
  it('passes the feedback verbatim to the RPC', async () => {
    hoisted.state.rpcResult = true;
    await submitPillFeedback('line-1', 'useful');
    expect(rpcCalls[0]).toEqual({
      name: 'submit_pill_feedback',
      args: { p_line_id: 'line-1', p_feedback: 'useful' },
    });
  });

  it('accepts both feedback values', async () => {
    hoisted.state.rpcResult = true;
    for (const feedback of ['useful', 'not_useful'] as const) {
      rpcCalls.length = 0;
      const result = await submitPillFeedback('line-1', feedback);
      expect(result.success).toBe(true);
      expect(rpcCalls[0].args.p_feedback).toBe(feedback);
    }
  });
});

describe('resurfaceMutedReason', () => {
  it('drops the workspace-disable + caller mutes via cortex.resurface_muted_reason', async () => {
    hoisted.state.rpcResult = true;
    const result = await resurfaceMutedReason('ws-1', 'proposal_engagement');
    expect(result.success).toBe(true);
    expect(rpcCalls[0]).toEqual({
      name: 'resurface_muted_reason',
      args: { p_workspace_id: 'ws-1', p_signal_type: 'proposal_engagement' },
    });
  });
});

describe('getActiveSignalDisablesForWorkspace', () => {
  it('rejects unauthenticated callers without touching the system client', async () => {
    hoisted.state.user = null;
    const result = await getActiveSignalDisablesForWorkspace('ws-1');
    expect(result.rows).toEqual([]);
    expect(result.error).toContain('Not authenticated');
    // Ensure we did NOT fall through to the service-role read.
    expect(fromCalls.some((c) => c.startsWith('system:'))).toBe(false);
  });

  it('rejects non-members of the workspace', async () => {
    hoisted.state.membershipRow = null;
    const result = await getActiveSignalDisablesForWorkspace('ws-1');
    expect(result.rows).toEqual([]);
    expect(result.error).toContain('Not a workspace member');
    expect(fromCalls.some((c) => c.startsWith('system:'))).toBe(false);
  });

  it('returns active disables once membership is verified', async () => {
    hoisted.state.membershipRow = { user_id: 'user-1' };
    hoisted.state.disablesRows = [
      { signal_type: 'proposal_engagement', disabled_until: '2026-05-25T00:00:00Z',
        fires_sampled: 22, not_useful_count: 18, hit_rate: 0.18, triggered_by: 'user-1',
        created_at: '2026-04-25T00:00:00Z' },
    ];
    const result = await getActiveSignalDisablesForWorkspace('ws-1');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].signal_type).toBe('proposal_engagement');
    // System client was used for the actual disables read (cessation-school
    // table has no client RLS policy).
    expect(fromCalls).toContain('system:aion_workspace_signal_disables');
  });
});

// ─── Source-level cross-table isolation guard ──────────────────────────────
//
// Cross-table boundary per docs/reference/aion-pill-history-design.md §4.3:
// pill-history Sheet + badge MUST NOT read or write cortex.aion_insights.
// That table is the lobby Daily Brief's surface, with its own
// greeting-identity telemetry that the pull-mode design depends on.
// If a pill-history file ever pulls from aion_insights, a stray write or
// read could pollute Brief metrics.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const PILL_HISTORY_PATHS = [
  '../pill-history-actions.ts',
  '../../components/PillHistorySheet.tsx',
  '../../components/PillUnseenDot.tsx',
];

// Strip JS/TS comment regions before scanning — we want to ban actual API
// surface (`.from('aion_insights')`, `.rpc('upsert_aion_insight')`, etc.),
// not natural-language mentions in design-intent comments.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('pill-history cross-table isolation (Wk 10 D7)', () => {
  for (const rel of PILL_HISTORY_PATHS) {
    it(`${rel} does not call the cortex.aion_insights API surface`, () => {
      const src = stripComments(readFileSync(resolve(__dirname, rel), 'utf8'));
      // Direct table reads / writes through supabase-js.
      expect(src).not.toMatch(/\.from\(\s*['"]aion_insights['"]/);
      // RPC names (string literals — must not appear outside comments).
      expect(src).not.toMatch(/['"]upsert_aion_insight['"]/);
      expect(src).not.toMatch(/['"]resolve_aion_insight['"]/);
      // Higher-level helpers wrapping the insight surface.
      expect(src).not.toMatch(/\bmarkInsightsSurfaced\b/);
      expect(src).not.toMatch(/\bgetBriefAndInsights\b/);
    });
  }

  it('the AionDealCard pill-history wiring does not call the aion_insights API', () => {
    const src = stripComments(readFileSync(
      resolve(__dirname, '../../../crm/components/aion-deal-card.tsx'),
      'utf8',
    ));
    const hasSheet = src.includes('PillHistorySheet');
    const hasInsightsCall =
      /['"]upsert_aion_insight['"]/.test(src) ||
      /['"]resolve_aion_insight['"]/.test(src) ||
      /\.from\(\s*['"]aion_insights['"]/.test(src) ||
      /\bmarkInsightsSurfaced\b/.test(src) ||
      /\bgetBriefAndInsights\b/.test(src);
    expect(hasSheet).toBe(true);
    expect(hasInsightsCall).toBe(false);
  });
});

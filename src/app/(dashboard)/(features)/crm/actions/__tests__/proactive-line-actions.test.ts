/**
 * Unit tests for proactive-line server actions.
 *
 * Wk 10 update: dismissProactiveLine now takes a reason; getActiveProactiveLine
 * gates the result through cortex.is_user_signal_muted (D6/D8 mute check).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Shared mock state (hoisted so vi.mock factories can read it) ──────────

const hoisted = vi.hoisted(() => {
  const state = {
    lineRow: null as Record<string, unknown> | null,
    rpcResult: null as unknown,
    rpcError: null as { message: string } | null,
    mutedResult: false as boolean,
  };
  return { state };
});

const chainCalls: Array<{ method: string; args: unknown[] }> = [];
const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

function makeReader(state: typeof hoisted.state) {
  const chain = {
    select: vi.fn(function (this: unknown, ...a: unknown[]) { chainCalls.push({ method: 'select', args: a }); return chain; }),
    eq:     vi.fn(function (this: unknown, ...a: unknown[]) { chainCalls.push({ method: 'eq',     args: a }); return chain; }),
    is:     vi.fn(function (this: unknown, ...a: unknown[]) { chainCalls.push({ method: 'is',     args: a }); return chain; }),
    gt:     vi.fn(function (this: unknown, ...a: unknown[]) { chainCalls.push({ method: 'gt',     args: a }); return chain; }),
    order:  vi.fn(function (this: unknown, ...a: unknown[]) { chainCalls.push({ method: 'order',  args: a }); return chain; }),
    limit:  vi.fn(function (this: unknown, ...a: unknown[]) { chainCalls.push({ method: 'limit',  args: a }); return chain; }),
    maybeSingle: vi.fn(async () => ({ data: state.lineRow, error: null })),
  };
  return chain;
}

vi.mock('@/shared/api/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    schema: (_s: string) => ({
      from: (_t: string) => makeReader(hoisted.state),
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        if (name === 'is_user_signal_muted') {
          return { data: hoisted.state.mutedResult, error: null };
        }
        return {
          data: hoisted.state.rpcResult,
          error: hoisted.state.rpcError,
        };
      }),
    }),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

// ─── SUT (import after mocks) ───────────────────────────────────────────────

import {
  getActiveProactiveLine,
  dismissProactiveLine,
} from '../proactive-line-actions';

beforeEach(() => {
  hoisted.state.lineRow = null;
  hoisted.state.rpcResult = null;
  hoisted.state.rpcError = null;
  hoisted.state.mutedResult = false;
  chainCalls.length = 0;
  rpcCalls.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('getActiveProactiveLine', () => {
  it('returns null when no active line exists', async () => {
    hoisted.state.lineRow = null;
    const result = await getActiveProactiveLine('deal-1');
    expect(result).toBeNull();
  });

  it('applies the three-gate active predicate (dismissed null, resolved null, expires > now)', async () => {
    hoisted.state.lineRow = {
      id: 'line-1', deal_id: 'deal-1', signal_type: 'money_event',
      headline: 'Deposit overdue', artifact_ref: { kind: 'proposal', id: 'p-1' },
      payload: {}, created_at: '2026-04-21T12:00:00Z', expires_at: '2026-04-24T12:00:00Z',
    };
    const result = await getActiveProactiveLine('deal-1');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('line-1');

    const isCalls = chainCalls.filter((c) => c.method === 'is');
    expect(isCalls).toEqual(
      expect.arrayContaining([
        { method: 'is', args: ['dismissed_at', null] },
        { method: 'is', args: ['resolved_at', null] },
      ]),
    );

    const gtCall = chainCalls.find((c) => c.method === 'gt');
    expect(gtCall?.args?.[0]).toBe('expires_at');
    expect(typeof gtCall?.args?.[1]).toBe('string');
  });

  it('scopes the read to the given dealId', async () => {
    hoisted.state.lineRow = null;
    await getActiveProactiveLine('deal-abc');
    const eqCall = chainCalls.find((c) => c.method === 'eq' && c.args[0] === 'deal_id');
    expect(eqCall?.args?.[1]).toBe('deal-abc');
  });

  it('returns null when the signal_type is muted for the caller (D6/D8)', async () => {
    hoisted.state.lineRow = {
      id: 'line-1', deal_id: 'deal-1', signal_type: 'proposal_engagement',
      headline: 'Proposal viewed 4x', artifact_ref: { kind: 'proposal', id: 'p-1' },
      payload: {}, created_at: '2026-04-21T12:00:00Z', expires_at: '2026-04-24T12:00:00Z',
    };
    hoisted.state.mutedResult = true;
    const result = await getActiveProactiveLine('deal-1');
    expect(result).toBeNull();

    const muteCall = rpcCalls.find((c) => c.name === 'is_user_signal_muted');
    expect(muteCall?.args).toEqual({
      p_signal_type: 'proposal_engagement',
      p_deal_id: 'deal-1',
    });
  });
});

// ─── Source-level cross-workspace regression guards ────────────────────────

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTIONS_SRC = readFileSync(
  resolve(__dirname, '../proactive-line-actions.ts'),
  'utf8',
);

describe('proactive-line-actions source discipline', () => {
  it('uses createClient (RLS-scoped) — never the service-role system client', () => {
    expect(ACTIONS_SRC).toContain("from '@/shared/api/supabase/server'");
    expect(ACTIONS_SRC).not.toContain('getSystemClient');
    expect(ACTIONS_SRC).not.toContain("from '@/shared/api/supabase/system'");
  });

  it('applies the three-gate active predicate in the read path', () => {
    expect(ACTIONS_SRC).toMatch(/\.is\(\s*'dismissed_at'\s*,\s*null\s*\)/);
    expect(ACTIONS_SRC).toMatch(/\.is\(\s*'resolved_at'\s*,\s*null\s*\)/);
    expect(ACTIONS_SRC).toMatch(/\.gt\(\s*'expires_at'/);
  });

  it('routes dismiss through the cortex RPC — never a raw UPDATE', () => {
    expect(ACTIONS_SRC).toContain('dismiss_aion_proactive_line');
    expect(ACTIONS_SRC).not.toMatch(/\.from\('aion_proactive_lines'\)\s*\.update\s*\(/);
  });

  it('gates the active read with cortex.is_user_signal_muted (Wk 10 D6/D8)', () => {
    expect(ACTIONS_SRC).toContain('is_user_signal_muted');
  });
});

describe('dismissProactiveLine', () => {
  it('returns success=true when the RPC returns true', async () => {
    hoisted.state.rpcResult = true;
    const result = await dismissProactiveLine('line-1', 'not_useful');
    expect(result.success).toBe(true);
  });

  it('passes the reason through to the RPC verbatim', async () => {
    hoisted.state.rpcResult = true;
    await dismissProactiveLine('line-1', 'snooze');
    const dismissCall = rpcCalls.find((c) => c.name === 'dismiss_aion_proactive_line');
    expect(dismissCall?.args).toEqual({ p_line_id: 'line-1', p_reason: 'snooze' });
  });

  it('accepts each of the three D5 reasons', async () => {
    hoisted.state.rpcResult = true;
    for (const reason of ['not_useful', 'already_handled', 'snooze'] as const) {
      rpcCalls.length = 0;
      const result = await dismissProactiveLine('line-1', reason);
      expect(result.success).toBe(true);
      const dismissCall = rpcCalls.find((c) => c.name === 'dismiss_aion_proactive_line');
      expect(dismissCall?.args.p_reason).toBe(reason);
    }
  });

  it('returns success=false with an error when the RPC errors', async () => {
    hoisted.state.rpcResult = null;
    hoisted.state.rpcError = { message: 'Not a member of that workspace' };
    const result = await dismissProactiveLine('line-1', 'not_useful');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not a member');
  });

  it('returns success=false when the RPC returns false (no-op)', async () => {
    hoisted.state.rpcResult = false;
    hoisted.state.rpcError = null;
    const result = await dismissProactiveLine('line-1', 'already_handled');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already dismissed');
  });
});

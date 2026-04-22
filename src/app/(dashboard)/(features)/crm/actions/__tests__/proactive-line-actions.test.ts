/**
 * Unit tests for Phase 2 Sprint 2 / Week 5 proactive-line server actions.
 *
 * Validates the thin glue around the RPC + the read-side filter predicates
 * (dismissed_at IS NULL AND resolved_at IS NULL AND expires_at > now()).
 * The cortex RPCs themselves are covered by DB-layer integration elsewhere.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Shared mock state (hoisted so vi.mock factories can read it) ──────────

const hoisted = vi.hoisted(() => {
  const state = {
    lineRow: null as Record<string, unknown> | null,
    rpcResult: null as unknown,
    rpcError: null as { message: string } | null,
  };
  return { state };
});

// Capture the filter chain so tests can assert the three-gate predicate was
// applied (dismissed_at null, resolved_at null, expires_at > now()).
const chainCalls: Array<{ method: string; args: unknown[] }> = [];

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
      rpc: vi.fn(async () => ({
        data: hoisted.state.rpcResult,
        error: hoisted.state.rpcError,
      })),
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
  chainCalls.length = 0;
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

    // `.is('dismissed_at', null)` and `.is('resolved_at', null)` were applied.
    const isCalls = chainCalls.filter((c) => c.method === 'is');
    expect(isCalls).toEqual(
      expect.arrayContaining([
        { method: 'is', args: ['dismissed_at', null] },
        { method: 'is', args: ['resolved_at', null] },
      ]),
    );

    // `.gt('expires_at', <iso>)` was applied with a recent ISO timestamp.
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
});

// ─── Source-level cross-workspace regression guards (Phase 2 Sprint 3 / Week 8) ─
//
// Per CLAUDE.md and the Phase 2 plan §3.2, proactive-line reads MUST use the
// authed user client (RLS clamps workspace) and NEVER the service-role system
// client. The cortex.aion_proactive_lines RLS policy is SELECT-only with
// `workspace_id IN (SELECT get_my_workspace_ids())`, so if a stale deal id
// from another workspace somehow arrives (e.g. after a workspace switch),
// the query returns nothing rather than leaking a headline.
//
// This source-level check fails loudly if someone routes the reader through
// the system client "to make it simpler" — replace with a real DB RLS test
// when the regression harness grows.

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
    // dismissed null + resolved null + expires > now. If someone removes any
    // gate, dismissed or expired lines will start re-rendering.
    expect(ACTIONS_SRC).toMatch(/\.is\(\s*'dismissed_at'\s*,\s*null\s*\)/);
    expect(ACTIONS_SRC).toMatch(/\.is\(\s*'resolved_at'\s*,\s*null\s*\)/);
    expect(ACTIONS_SRC).toMatch(/\.gt\(\s*'expires_at'/);
  });

  it('routes dismiss through the cortex RPC — never a raw UPDATE', () => {
    // The cortex RPC enforces workspace-member check. Removing it and
    // writing UPDATE directly would bypass the auth gate.
    expect(ACTIONS_SRC).toContain("dismiss_aion_proactive_line");
    expect(ACTIONS_SRC).not.toMatch(/\.from\('aion_proactive_lines'\)\s*\.update\s*\(/);
  });
});

describe('dismissProactiveLine', () => {
  it('returns success=true when the RPC returns true', async () => {
    hoisted.state.rpcResult = true;
    const result = await dismissProactiveLine('line-1');
    expect(result.success).toBe(true);
  });

  it('returns success=false with an error when the RPC errors', async () => {
    hoisted.state.rpcResult = null;
    hoisted.state.rpcError = { message: 'Not a member of that workspace' };
    const result = await dismissProactiveLine('line-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Not a member');
  });

  it('returns success=false when the RPC returns false (no-op)', async () => {
    hoisted.state.rpcResult = false;
    hoisted.state.rpcError = null;
    const result = await dismissProactiveLine('line-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('already dismissed');
  });
});

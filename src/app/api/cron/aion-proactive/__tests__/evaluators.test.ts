/**
 * Unit tests for Phase 2 Sprint 2 proactive-line gate logic.
 *
 * The three signal evaluators are thin wrappers over SQL queries — integration
 * coverage lives in a follow-up DB test suite. These unit tests focus on the
 * pure decision logic that the orchestrator depends on:
 *
 *   1. Quiet-hours + weekend emission window is correct across timezones.
 *   2. Throttle helper treats the "2 dismisses in 14d → mute 7d" rule per
 *      (user, deal, signal_type) correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  isWithinEmissionWindow,
  isSignalMuted,
  fetchAutoDisabledSignals,
} from '../evaluators';

// ─── isWithinEmissionWindow ─────────────────────────────────────────────────

describe('isWithinEmissionWindow', () => {
  it('permits a Tuesday at 10:00 local time', () => {
    // 2026-04-21 is a Tuesday. 10:00 UTC — works against UTC tz trivially.
    const now = new Date('2026-04-21T10:00:00Z');
    expect(isWithinEmissionWindow(now, 'UTC')).toBe(true);
  });

  it('blocks a weekday before 08:00 local', () => {
    const now = new Date('2026-04-21T07:30:00Z'); // 07:30 UTC, Tuesday
    expect(isWithinEmissionWindow(now, 'UTC')).toBe(false);
  });

  it('blocks a weekday at 19:00 local (exclusive upper bound)', () => {
    const now = new Date('2026-04-21T19:00:00Z');
    expect(isWithinEmissionWindow(now, 'UTC')).toBe(false);
  });

  it('blocks weekends entirely', () => {
    // 2026-04-18 is a Saturday.
    expect(isWithinEmissionWindow(new Date('2026-04-18T14:00:00Z'), 'UTC')).toBe(false);
    // 2026-04-19 is a Sunday.
    expect(isWithinEmissionWindow(new Date('2026-04-19T14:00:00Z'), 'UTC')).toBe(false);
  });

  it('applies gates in the workspace timezone, not UTC', () => {
    // 15:00 UTC on Tuesday → 08:00 PDT (LA). Should emit.
    const earlyLA = new Date('2026-04-21T15:00:00Z');
    expect(isWithinEmissionWindow(earlyLA, 'America/Los_Angeles')).toBe(true);

    // 07:00 UTC on Tuesday → 00:00 PDT (midnight) → outside window.
    const lateNightLA = new Date('2026-04-21T07:00:00Z');
    expect(isWithinEmissionWindow(lateNightLA, 'America/Los_Angeles')).toBe(false);

    // UTC noon becomes late night in Australia → outside window there.
    const noonUTC = new Date('2026-04-21T12:00:00Z');
    expect(isWithinEmissionWindow(noonUTC, 'Australia/Sydney')).toBe(false);
  });
});

// ─── isSignalMuted ──────────────────────────────────────────────────────────

/**
 * Builds a fake supabase client whose single query path returns the given
 * dismissal history. The real evaluator uses:
 *   .schema('cortex').from(...).select(...).eq(...).eq(...).eq(...)
 *     .not(...).gte(...).order(...).limit(...)
 * We model that chain with a chainable proxy that returns { data } at the end.
 */
function makeFakeClient(dismissals: Array<{ dismissed_at: string; dismissed_by: string | null }>) {
  const terminal = Promise.resolve({ data: dismissals, error: null });
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  const proxy = new Proxy(chain, {
    get(_, prop) {
      if (prop === 'then') return terminal.then.bind(terminal);
      return (..._a: unknown[]) => proxy;
    },
  });
  return {
    schema: () => ({
      from: () => proxy,
    }),
  } as unknown as Parameters<typeof isSignalMuted>[0];
}

describe('isSignalMuted', () => {
  const now = new Date('2026-04-21T12:00:00Z');
  const dayAgo = (d: number) => new Date(now.getTime() - d * 24 * 3600 * 1000).toISOString();

  it('does not mute when fewer than 2 dismissals', async () => {
    const client = makeFakeClient([
      { dismissed_at: dayAgo(1), dismissed_by: 'user-1' },
    ]);
    const muted = await isSignalMuted(client, 'ws-1', 'deal-1', 'money_event', now);
    expect(muted).toBe(false);
  });

  it('mutes when one user has 2+ dismissals within 14d AND the most recent is within 7d', async () => {
    const client = makeFakeClient([
      { dismissed_at: dayAgo(2), dismissed_by: 'user-1' },
      { dismissed_at: dayAgo(5), dismissed_by: 'user-1' },
    ]);
    const muted = await isSignalMuted(client, 'ws-1', 'deal-1', 'money_event', now);
    expect(muted).toBe(true);
  });

  it('does not mute when the most recent dismissal is >7 days old (mute window expired)', async () => {
    const client = makeFakeClient([
      { dismissed_at: dayAgo(8),  dismissed_by: 'user-1' },
      { dismissed_at: dayAgo(12), dismissed_by: 'user-1' },
    ]);
    const muted = await isSignalMuted(client, 'ws-1', 'deal-1', 'money_event', now);
    expect(muted).toBe(false);
  });

  it('does not mute when two dismissals come from different users (per-user threshold)', async () => {
    const client = makeFakeClient([
      { dismissed_at: dayAgo(1), dismissed_by: 'user-1' },
      { dismissed_at: dayAgo(2), dismissed_by: 'user-2' },
    ]);
    const muted = await isSignalMuted(client, 'ws-1', 'deal-1', 'money_event', now);
    expect(muted).toBe(false);
  });

  it('ignores rows with a null dismissed_by (should not happen, but defensive)', async () => {
    const client = makeFakeClient([
      { dismissed_at: dayAgo(1), dismissed_by: null },
      { dismissed_at: dayAgo(2), dismissed_by: null },
    ]);
    const muted = await isSignalMuted(client, 'ws-1', 'deal-1', 'money_event', now);
    expect(muted).toBe(false);
  });
});

// ─── fetchAutoDisabledSignals — soft (35%) + hard (Wk 10 D8) gates ─────────

function makeRpcClient(
  rpcData: Array<{ signal_type: string; above_threshold: boolean }>,
  hardDisables: Array<{ signal_type: string }> = [],
) {
  return {
    schema: () => ({
      rpc: async () => ({ data: rpcData, error: null }),
      from: () => {
        const chain = {
          select: () => chain,
          eq:     () => chain,
          gt:     async () => ({ data: hardDisables, error: null }),
        };
        return chain;
      },
    }),
  } as unknown as Parameters<typeof fetchAutoDisabledSignals>[0];
}

describe('fetchAutoDisabledSignals', () => {
  it('returns an empty set when no signal is above threshold and no hard disable', async () => {
    const client = makeRpcClient([
      { signal_type: 'money_event', above_threshold: false },
      { signal_type: 'dead_silence', above_threshold: false },
    ]);
    const disabled = await fetchAutoDisabledSignals(client, 'ws-1');
    expect(disabled.size).toBe(0);
  });

  it('collects every signal_type that is above the soft threshold', async () => {
    const client = makeRpcClient([
      { signal_type: 'money_event', above_threshold: false },
      { signal_type: 'proposal_engagement', above_threshold: true },
      { signal_type: 'dead_silence', above_threshold: true },
    ]);
    const disabled = await fetchAutoDisabledSignals(client, 'ws-1');
    expect(disabled.has('proposal_engagement')).toBe(true);
    expect(disabled.has('dead_silence')).toBe(true);
    expect(disabled.has('money_event')).toBe(false);
  });

  it('unions D8 hard disables with the soft gate', async () => {
    const client = makeRpcClient(
      [{ signal_type: 'money_event', above_threshold: false }],
      [{ signal_type: 'money_event' }],
    );
    const disabled = await fetchAutoDisabledSignals(client, 'ws-1');
    expect(disabled.has('money_event')).toBe(true);
  });

  it('tolerates empty payloads on both sides (first-run workspace)', async () => {
    const client = makeRpcClient([], []);
    const disabled = await fetchAutoDisabledSignals(client, 'ws-fresh');
    expect(disabled.size).toBe(0);
  });
});

// ─── Wire-up sanity ─────────────────────────────────────────────────────────

describe('evaluators module exports', () => {
  it('keeps the signal_type taxonomy stable', async () => {
    // The cron hard-depends on exactly these three signal types. Adding a
    // fourth requires a plan change + DB CHECK constraint update.
    const evaluators = await import('../evaluators');
    expect(typeof evaluators.evaluateProposalEngagement).toBe('function');
    expect(typeof evaluators.evaluateMoneyEvent).toBe('function');
    expect(typeof evaluators.evaluateDeadSilence).toBe('function');
  });
});

// Silence noisy console logs during tests.
vi.spyOn(console, 'error').mockImplementation(() => { /* swallow */ });

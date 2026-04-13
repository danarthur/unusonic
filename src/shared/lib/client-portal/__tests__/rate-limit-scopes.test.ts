/**
 * Rate-limit scope regression guards.
 *
 * These tests pin specific numerical decisions from the Songs design
 * doc §0 A7. If any of them fail, the client-portal Songs UX will
 * break — either the couple rage-quits mid-list-build (cap too low) or
 * we become a spam vector (cap too high). Do not change these numbers
 * without a corresponding update to the design doc and a conversation.
 */
import { describe, it, expect } from 'vitest';

// Poke at the scope defaults via the exported module shape. The test
// imports through a tiny inline helper rather than reaching into
// private module state — this keeps SCOPE_DEFAULTS encapsulated while
// still letting us pin its values. The test calls checkRateLimit()
// with a mocked getSystemClient so we can observe the limit that got
// passed through.
import { vi } from 'vitest';

type RpcArgs = {
  p_scope: string;
  p_key: string;
  p_limit: number;
  p_window_seconds: number;
};

const rpcSpy = vi.fn();

vi.mock('@/shared/api/supabase/system', () => ({
  getSystemClient: () => ({
    rpc: async (_name: string, args: RpcArgs) => {
      rpcSpy(args);
      return { data: [{ allowed: true, current_count: 0, retry_after_seconds: 0 }], error: null };
    },
  }),
}));

import { checkRateLimit } from '../rate-limit';

describe('rate-limit scope defaults (Songs A7)', () => {
  it('song_request_entity is 150 per 24 hours (A7 — do not lower)', async () => {
    // Reason for 150: a couple building a wedding playlist in one sitting
    // realistically hits 50-80 mutations across add/update/delete.
    // The original first-pass cap of 30/day throttled the primary happy
    // path. The 100-entry hard ceiling lives on the RPC; this limit is
    // the anti-spam guardrail only. See Songs design doc §0 A7.
    rpcSpy.mockClear();
    await checkRateLimit('song_request_entity', 'test-entity-id');

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    const args = rpcSpy.mock.calls[0][0] as RpcArgs;
    expect(args.p_scope).toBe('song_request_entity');
    expect(args.p_limit).toBe(150);
    expect(args.p_window_seconds).toBe(24 * 60 * 60);
  });

  it('magic_link_email is still 3 per hour (no accidental drift)', async () => {
    rpcSpy.mockClear();
    await checkRateLimit('magic_link_email', 'hashed-key');

    const args = rpcSpy.mock.calls[0][0] as RpcArgs;
    expect(args.p_limit).toBe(3);
    expect(args.p_window_seconds).toBe(60 * 60);
  });
});

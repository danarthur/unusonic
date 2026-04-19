/**
 * Phase 2 magic-link send rate limiter — in-memory token bucket keyed by
 * IP and email-hash.
 *
 * ## Why in-memory
 *
 * The existing DB-backed limiter (`src/shared/lib/client-portal/rate-limit.ts`)
 * is scoped to client-portal magic-link flows and would require new DB
 * scopes to reuse here. Phase 2 is a reversible, feature-flagged roll-out
 * behind `AUTH_V2_MAGIC_LINK_REPLACES_OTP` (default OFF). A small in-memory
 * guard is enough to cover the three cases that matter during shadow traffic:
 *
 *   1. A single box mashing Continue repeatedly.
 *   2. A single email address getting hammered across tabs.
 *   3. A trivially bad script hitting the send endpoint in a tight loop.
 *
 * Phase 6 will harden this behind the same DB-backed `client_check_rate_limit`
 * RPC (or an equivalent) once the dispatcher unifies the three enumeration
 * branches — the call site here (`sendMagicLinkAction`) already accepts the
 * same typed result shape so the upgrade is a swap, not a rewrite.
 *
 * ## Caveats (documented, not hidden)
 *
 * - **Per-process state.** In a multi-worker Node deployment each worker
 *   has its own bucket; effective cap is `limit × workers`. Acceptable for
 *   the interim because this is a soft abuse guard, not a security boundary.
 * - **Reset on deploy.** A rolling restart will zero the buckets. Phase 6
 *   moves to DB.
 * - **Memory-bound.** Buckets expire lazily via a size cap + sliding-window
 *   sweep; no unbounded growth.
 *
 * ## Semantics
 *
 * - **IP bucket:** 10 sends / 60 000 ms.
 * - **Email-hash bucket:** 5 sends / 60 000 ms.
 *
 * Both are checked and recorded on each call; if either trips, the caller
 * MUST return the enumeration-safe generic response (no reveal of which
 * key was throttled).
 *
 * @module features/auth/smart-login/lib/magic-link-rate-limit
 */

import 'server-only';

/** Bucket configuration. Values mirror Phase 2 spec §3.1. */
const DEFAULTS = {
  ipLimit: 10,
  emailLimit: 5,
  windowMs: 60_000,
  /** Hard cap on tracked keys before a sweep runs. Keeps memory bounded. */
  maxKeys: 10_000,
} as const;

/** Ring-buffer of send timestamps (ms since epoch) per key. */
type Bucket = number[];

/** Per-identifier scopes. Separate stores so IP hits don't count against email and vice versa. */
const ipBucket = new Map<string, Bucket>();
const emailBucket = new Map<string, Bucket>();

/**
 * Drops timestamps older than the current window. Called before every
 * read so a stale key never decides a throttle. O(k) where k is the
 * small per-key bucket length.
 */
function prune(store: Map<string, Bucket>, key: string, nowMs: number, windowMs: number): Bucket {
  const bucket = store.get(key);
  if (!bucket) return [];
  const cutoff = nowMs - windowMs;
  // Timestamps monotonically increase, so a single slice from the first
  // in-window entry is faster than filter().
  let firstInWindow = 0;
  while (firstInWindow < bucket.length && bucket[firstInWindow] <= cutoff) {
    firstInWindow++;
  }
  const pruned = firstInWindow === 0 ? bucket : bucket.slice(firstInWindow);
  if (pruned.length === 0) {
    store.delete(key);
    return [];
  }
  if (pruned !== bucket) store.set(key, pruned);
  return pruned;
}

/**
 * Size guard. If the store balloons past {@link DEFAULTS.maxKeys}, drop
 * every entry whose newest timestamp is outside the window. Called only
 * when the cap is hit so the common path stays O(1).
 */
function maybeSweep(store: Map<string, Bucket>, nowMs: number, windowMs: number): void {
  if (store.size < DEFAULTS.maxKeys) return;
  const cutoff = nowMs - windowMs;
  for (const [key, bucket] of store.entries()) {
    const latest = bucket[bucket.length - 1];
    if (latest === undefined || latest <= cutoff) {
      store.delete(key);
    }
  }
}

export type MagicLinkRateLimitOutcome =
  | { allowed: true }
  | {
      allowed: false;
      /** Which bucket tripped. Exposed for telemetry only — NEVER surface to the caller. */
      scope: 'ip' | 'email';
      /** Seconds until the bucket has at least one free slot. */
      retryAfterSeconds: number;
    };

/**
 * Options let tests inject a clock and override limits without mutating
 * global state or sleeping. Production callers pass nothing.
 */
export type MagicLinkRateLimitOptions = {
  ipLimit?: number;
  emailLimit?: number;
  windowMs?: number;
  /** Override `Date.now()` for deterministic unit tests. */
  now?: () => number;
};

/**
 * Evaluates a single bucket. Returns the deny outcome when tripped,
 * or `null` to signal "this bucket allowed the call." Kept separate
 * so the top-level function stays below the cyclomatic-complexity cap.
 */
function evaluateBucket(args: {
  store: Map<string, Bucket>;
  key: string;
  limit: number;
  windowMs: number;
  now: number;
  scope: 'ip' | 'email';
}): Extract<MagicLinkRateLimitOutcome, { allowed: false }> | null {
  const pruned = prune(args.store, args.key, args.now, args.windowMs);
  if (pruned.length < args.limit) return null;
  const oldest = pruned[0]!;
  return {
    allowed: false,
    scope: args.scope,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((oldest + args.windowMs - args.now) / 1000),
    ),
  };
}

/** Record a send on a bucket. Mutates store in place. */
function recordBucket(store: Map<string, Bucket>, key: string, now: number): void {
  const current = store.get(key) ?? [];
  current.push(now);
  store.set(key, current);
}

/**
 * Check the magic-link send rate limit for a given (ip, emailHash) pair
 * and, when allowed, record the send. Returns the first-tripping scope
 * when denied; the caller maps both outcomes to the generic "check your
 * email" response so nothing leaks to the network.
 *
 * Passing `ip = null` is legal (fronts behind proxies that strip the
 * header still get protected by the email bucket). Passing an empty
 * `emailHash` is considered a programming error — throw rather than
 * allow a bypass.
 */
export function checkMagicLinkRateLimit(
  params: { ip: string | null; emailHash: string },
  options: MagicLinkRateLimitOptions = {},
): MagicLinkRateLimitOutcome {
  if (!params.emailHash || typeof params.emailHash !== 'string') {
    throw new Error('checkMagicLinkRateLimit: emailHash is required.');
  }
  const ipLimit = options.ipLimit ?? DEFAULTS.ipLimit;
  const emailLimit = options.emailLimit ?? DEFAULTS.emailLimit;
  const windowMs = options.windowMs ?? DEFAULTS.windowMs;
  const now = (options.now ?? Date.now)();

  maybeSweep(ipBucket, now, windowMs);
  maybeSweep(emailBucket, now, windowMs);

  // IP first — cheap to skip when caller couldn't resolve one.
  if (params.ip) {
    const denied = evaluateBucket({
      store: ipBucket,
      key: params.ip,
      limit: ipLimit,
      windowMs,
      now,
      scope: 'ip',
    });
    if (denied) return denied;
  }

  const deniedEmail = evaluateBucket({
    store: emailBucket,
    key: params.emailHash,
    limit: emailLimit,
    windowMs,
    now,
    scope: 'email',
  });
  if (deniedEmail) return deniedEmail;

  if (params.ip) recordBucket(ipBucket, params.ip, now);
  recordBucket(emailBucket, params.emailHash, now);

  return { allowed: true };
}

/**
 * Reset the in-memory stores. Exported for tests only; never call from
 * production code (would hand an attacker a free throttle reset).
 */
export function __resetMagicLinkRateLimitStore(): void {
  ipBucket.clear();
  emailBucket.clear();
}

/** Exposed for unit tests so they can assert the default window. */
export const MAGIC_LINK_RATE_LIMIT_DEFAULTS = DEFAULTS;

/**
 * Guardian-setup constants extracted from the server-action module.
 *
 * Next.js 16 forbids non-function exports from `'use server'` files, so the
 * threshold bounds live here instead of alongside `addGuardian` etc. Safe to
 * import from both server and client code — pure literals, no Supabase or
 * email-send dependencies.
 */

/**
 * Lowest usable Shamir threshold. The repo ships a fixed 2-of-3 splitter in
 * `src/shared/lib/security/sharding.ts`, so anything below 2 can't actually
 * reconstruct a key.
 */
export const GUARDIAN_MIN_THRESHOLD = 2;

/** Upper bound for the Shamir threshold (matches the 2-of-3 splitter). */
export const GUARDIAN_MAX_THRESHOLD = 3;

/**
 * Threshold the Phase 5 onboarding gate enforces by default.
 */
export const GUARDIAN_DEFAULT_THRESHOLD = 2;

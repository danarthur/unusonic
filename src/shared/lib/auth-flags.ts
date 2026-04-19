/**
 * Env-based auth feature flags for the login redesign rollout.
 *
 * Unlike `feature-flags.ts` (per-workspace DB-backed flags for product
 * features), auth flags are **process-wide** and driven by environment
 * variables. They gate the progressive cutover of the login/auth surface
 * during the Phase 0–6 rollout described in
 * `docs/reference/login-redesign-implementation-plan.md`.
 *
 * ## Scope & semantics
 *
 * - Default is **OFF** for every flag. Any unset, empty, or malformed
 *   value resolves to `false`. Only the literal strings `'1'`, `'true'`,
 *   `'TRUE'`, `'on'`, `'ON'`, `'yes'`, `'YES'` (case-insensitive) enable
 *   a flag.
 * - Server-side reads use bare `AUTH_V2_*` env vars.
 * - If a flag needs to be checked in client code, a `NEXT_PUBLIC_AUTH_V2_*`
 *   mirror must be introduced explicitly — never expose server-only flags
 *   to the browser bundle. All flags here are currently server-only.
 * - No network calls, no DB lookups. Pure env read, safe to call in a
 *   hot path.
 *
 * ## Testing
 *
 * The reader takes an optional `env` argument so unit tests can pass a
 * synthetic environment without mutating `process.env`.
 *
 * @module shared/lib/auth-flags
 */

/**
 * Registry of known auth feature flag keys.
 *
 * These are added up-front in Phase 0 so every downstream phase can
 * reference them without touching this file. Flipping a flag ON lives
 * entirely in the deploy environment — no code change required.
 */
export const AUTH_FLAGS = {
  /**
   * Phase 4. Swaps the old sign-in card for the new state-machine
   * version (`sign-in-card.tsx` rewrite). While OFF, the existing card
   * renders unchanged.
   */
  AUTH_V2_LOGIN_CARD: 'AUTH_V2_LOGIN_CARD',
  /**
   * Phase 2 → 4. Swaps 6-digit OTP send for a magic-link send. While
   * OFF, `sendOtpAction` is used as today.
   */
  AUTH_V2_MAGIC_LINK_REPLACES_OTP: 'AUTH_V2_MAGIC_LINK_REPLACES_OTP',
  /**
   * Phase 5. Makes the guardian-setup step in onboarding non-skippable
   * (owners only). While OFF, onboarding renders as today.
   */
  AUTH_V2_GUARDIAN_GATE: 'AUTH_V2_GUARDIAN_GATE',
  /**
   * Phase 6. Enables the workspace-scoped SMS OTP opt-in path on the
   * sign-in card and the `sms-otp-send` edge function. While OFF, the
   * SMS controls are hidden.
   */
  AUTH_V2_SMS: 'AUTH_V2_SMS',
} as const;

/** Typed key into {@link AUTH_FLAGS}. Use at call sites to guard typos. */
export type AuthFlagKey = (typeof AUTH_FLAGS)[keyof typeof AUTH_FLAGS];

/**
 * Normalizes an env-var value to a boolean. Only a narrow allowlist of
 * strings enables a flag; everything else — including `'false'`, `'0'`,
 * `undefined`, `''`, whitespace, or junk — resolves to `false`.
 */
function parseFlagValue(raw: string | undefined): boolean {
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return false;
  return normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes';
}

/**
 * Returns true iff the named auth flag is enabled in the given
 * environment (defaults to `process.env`).
 *
 * All flags default to `false`. A typed key is required, so unknown
 * flags cannot leak through at runtime.
 *
 * @example
 * ```ts
 * if (getAuthFlag('AUTH_V2_LOGIN_CARD')) {
 *   return <NewSignInCard />;
 * }
 * return <LegacySignInCard />;
 * ```
 */
export function getAuthFlag(
  flag: AuthFlagKey,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseFlagValue(env[flag]);
}

/**
 * Returns a snapshot of every known auth flag's current state.
 *
 * Intended for telemetry — e.g. logging which flags were on at the
 * moment a Continue-button resolution happened. The snapshot is a plain
 * object with stable keys, safe to JSON-stringify.
 */
export function getAuthFlagsSnapshot(
  env: Record<string, string | undefined> = process.env,
): Record<AuthFlagKey, boolean> {
  const snapshot = {} as Record<AuthFlagKey, boolean>;
  for (const key of Object.values(AUTH_FLAGS)) {
    snapshot[key] = parseFlagValue(env[key]);
  }
  return snapshot;
}

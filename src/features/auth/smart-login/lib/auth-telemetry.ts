/**
 * Shadow telemetry for the Continue-button resolution path.
 *
 * Phase 0 of the login redesign. See
 * `docs/reference/login-redesign-implementation-plan.md`. This module
 * wraps the existing `sendOtpAction` / `signInAction` server actions
 * with a structured log emission so we can observe the distribution of
 * resolution outcomes across a week of shadow traffic BEFORE the Phase
 * 4 UI cutover, while every `AUTH_V2_*` flag is OFF.
 *
 * ## What this emits
 *
 * A single JSON-serializable `continue_resolved` event per Continue
 * press, containing:
 *
 * - `email_hash` — salted SHA-256 of the email. Never raw PII.
 * - `resolution` — which path the server took
 *   (`passkey | magic_link | session_expired | unknown | rate_limited`).
 * - `latency_ms` — wall time of the decision, including jitter floor.
 * - `user_agent_class` — coarse device bucket for slicing.
 * - `flag_snapshot` — snapshot of all `AUTH_V2_*` flags at emit time,
 *   so later analysis can segment by flag state when rollout begins.
 * - `timestamp_iso` — event time in ISO 8601.
 *
 * ## Where events go
 *
 * Phase 0 emits to stdout via `console.log(JSON.stringify(event))`.
 * That shape is stable and can be ingested by a structured-log shipper
 * (Sentry breadcrumb, Axiom, Datadog, etc.) without further code
 * changes. **No database writes.** **No new RPC.** If an emit throws
 * for any reason, we swallow the error — telemetry must never break
 * the auth path.
 *
 * ## What this does NOT do
 *
 * - It does not alter routing or user-visible behavior.
 * - It does not read or write cookies.
 * - It does not emit on keystrokes, only on Continue submission.
 *
 * @module features/auth/smart-login/lib/auth-telemetry
 */

import 'server-only';
import { z } from 'zod';

import { getAuthFlagsSnapshot, type AuthFlagKey } from '@/shared/lib/auth-flags';
import { hashEmailForTelemetry } from '@/shared/lib/auth/hash-email-for-telemetry';
import {
  classifyUserAgent,
  type UserAgentClass,
} from '@/shared/lib/auth/classify-user-agent';

/**
 * Resolution outcomes for a Continue-button press.
 *
 * - `passkey` — user has (or would have) a registered passkey and the
 *   server would route to conditional mediation.
 * - `magic_link` — no passkey; the server would send a magic link
 *   (Phase 2+) or OTP (legacy).
 * - `session_expired` — request came from the session-expired variant
 *   and auto-triggered conditional mediation.
 * - `unknown` — the email matches no account and no ghost; the server
 *   returns the enumeration-safe "check your email" response.
 * - `rate_limited` — IP/email-hash rate limit fired.
 * - `sms_sent` — Phase 6. An SMS code was successfully dispatched via
 *   the `sms-otp-send` edge function.
 * - `sms_verified` — Phase 6. A user-submitted SMS code matched and a
 *   session was established.
 */
export const AUTH_RESOLUTIONS = [
  'passkey',
  'magic_link',
  'session_expired',
  'unknown',
  'rate_limited',
  'sms_sent',
  'sms_verified',
] as const;

export type AuthResolution = (typeof AUTH_RESOLUTIONS)[number];

/**
 * Schema for the shadow telemetry event. Round-trippable through
 * `JSON.stringify` / `JSON.parse`.
 */
export const authTelemetryEventSchema = z.object({
  event: z.literal('continue_resolved'),
  email_hash: z.string(),
  resolution: z.enum(AUTH_RESOLUTIONS),
  latency_ms: z.number().int().nonnegative(),
  user_agent_class: z.enum(['ios', 'android', 'mac', 'windows', 'linux', 'other']),
  flag_snapshot: z.record(z.string(), z.boolean()),
  timestamp_iso: z.string().datetime(),
});

export type AuthTelemetryEvent = z.infer<typeof authTelemetryEventSchema>;

/**
 * Input accepted by {@link emitContinueResolved}. The shape the callers
 * build up during the Continue path; we normalize + hash it into the
 * full event here.
 */
export type EmitContinueResolvedInput = {
  email: string;
  resolution: AuthResolution;
  latencyMs: number;
  userAgent: string | null | undefined;
  /**
   * Optional override of the flag snapshot. Defaults to reading from
   * the live `process.env` via `getAuthFlagsSnapshot()`. Tests can pass
   * a synthetic snapshot to avoid env coupling.
   */
  flagSnapshot?: Record<AuthFlagKey, boolean>;
  /**
   * Optional override for the current timestamp. Tests inject a fixed
   * value; production callers omit.
   */
  now?: Date;
};

/**
 * Builds the `AuthTelemetryEvent` record without emitting. Pure
 * function — all I/O-shaped dependencies (flag snapshot, timestamp)
 * are injected.
 *
 * Exported so unit tests can assert event shape and so future shippers
 * (Sentry/Axiom) can consume the object directly.
 */
export function buildAuthTelemetryEvent(
  input: EmitContinueResolvedInput,
): AuthTelemetryEvent {
  const userAgentClass: UserAgentClass = classifyUserAgent(input.userAgent);
  const flagSnapshot = input.flagSnapshot ?? getAuthFlagsSnapshot();
  const timestamp = (input.now ?? new Date()).toISOString();
  const latency = Math.max(0, Math.round(input.latencyMs));

  return {
    event: 'continue_resolved',
    email_hash: hashEmailForTelemetry(input.email),
    resolution: input.resolution,
    latency_ms: latency,
    user_agent_class: userAgentClass,
    flag_snapshot: { ...flagSnapshot },
    timestamp_iso: timestamp,
  };
}

/**
 * Emits a Continue-resolution event. Writes a single JSON line to
 * stdout. Never throws — if anything in the emit path fails (hash
 * error, console failure), the error is swallowed and the auth path
 * proceeds unmodified.
 *
 * Callers should build the input once per Continue press, after the
 * server has decided which path to take.
 */
export function emitContinueResolved(input: EmitContinueResolvedInput): void {
  try {
    const event = buildAuthTelemetryEvent(input);
    console.log(JSON.stringify(event));
  } catch {
    // Intentionally swallow. Telemetry must never break auth.
  }
}

/**
 * Phase 4 — spike-detection signal for the enumeration guard.
 *
 * Emitted when `resolveContinueAction` resolves an email to an
 * unclaimed `directory.entities` ghost. Carries only the hashed email +
 * UA class + flag snapshot — never the raw email, never the entity id,
 * never the workspace id.
 *
 * ## Why this event
 *
 * The bare-email Continue response is identical across account-exists,
 * ghost-match, and unknown. A spike in ghost-match resolutions against
 * the same IP or user-agent class means someone is probing the
 * enumeration surface — the alerting rule fires off the hash-to-UA
 * distribution of this event, not a user-visible signal.
 *
 * Stays separate from `continue_resolved` so the primary rollout
 * dashboard isn't polluted by an event that fires on a fraction of
 * presses. Tests and Sentry can subscribe to the `ghost_match_on_signin`
 * literal discriminant directly.
 */
export const ghostMatchTelemetryEventSchema = z.object({
  event: z.literal('ghost_match_on_signin'),
  email_hash: z.string(),
  user_agent_class: z.enum(['ios', 'android', 'mac', 'windows', 'linux', 'other']),
  flag_snapshot: z.record(z.string(), z.boolean()),
  timestamp_iso: z.string().datetime(),
});

export type GhostMatchTelemetryEvent = z.infer<typeof ghostMatchTelemetryEventSchema>;

/**
 * Input accepted by {@link emitGhostMatch}. Same shape as the Continue
 * telemetry input minus `resolution`/`latencyMs` — the event is a
 * presence signal, not a latency measurement.
 */
export type EmitGhostMatchInput = Omit<
  EmitContinueResolvedInput,
  'resolution' | 'latencyMs'
>;

/** Build (no emit) — exported for unit-test assertions. */
export function buildGhostMatchEvent(
  input: EmitGhostMatchInput,
): GhostMatchTelemetryEvent {
  const userAgentClass: UserAgentClass = classifyUserAgent(input.userAgent);
  const flagSnapshot = input.flagSnapshot ?? getAuthFlagsSnapshot();
  const timestamp = (input.now ?? new Date()).toISOString();

  return {
    event: 'ghost_match_on_signin',
    email_hash: hashEmailForTelemetry(input.email),
    user_agent_class: userAgentClass,
    flag_snapshot: { ...flagSnapshot },
    timestamp_iso: timestamp,
  };
}

/**
 * Emit a single ghost-match event. Never throws — telemetry must never
 * break auth. Same contract as {@link emitContinueResolved}.
 */
export function emitGhostMatch(input: EmitGhostMatchInput): void {
  try {
    const event = buildGhostMatchEvent(input);
    console.log(JSON.stringify(event));
  } catch {
    // Intentionally swallow. Telemetry must never break auth.
  }
}

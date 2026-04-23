/**
 * Server-side mobile-surface detection for the /api/aion/chat route.
 *
 * Phase 3 §3.4 B3 fix — voice-draft tool set (including send_reply) is
 * ONLY available when the request is a genuine mobile POST. Two-layer gate:
 *
 *   1. Client must set `x-aion-surface: mobile` on the request.
 *      (AionVoice / SessionContext sets this on mobile surfaces; desktop
 *      never does.)
 *   2. User-Agent must match a mobile regex — header alone is spoofable from
 *      any client, so UA provides a second independent check. Belt + RLS
 *      pattern: both must pass.
 *
 * When either check fails, voice-intent tools (VOICE_INTENT_TOOL_NAMES below)
 * are stripped from `buildToolsForIntent`'s output, even if the Intent
 * classifier would have included them. This prevents a desktop POST with a
 * voice-transcript body from surfacing `send_reply` — the core regression
 * we're guarding against.
 *
 * Regression test: src/app/api/aion/chat/__tests__/voice-intent-gate.test.ts
 */

const MOBILE_SURFACE_HEADER = 'x-aion-surface';
const MOBILE_SURFACE_VALUE = 'mobile';

/**
 * Match iOS Safari, iPadOS, and Android mobile browsers. Deliberately tight —
 * desktop Safari's UA contains "Safari" and "Version", mobile adds "Mobile".
 * An impersonated UA + spoofed header would bypass this; we still require the
 * upstream auth.uid() + workspace-member checks in every write tool.
 */
const MOBILE_UA_REGEX = /(iPhone|Android.*Mobile|iPod|Mobile Safari|iPad)/i;

/**
 * Tools gated behind the mobile-surface check. When the request is NOT a
 * verified mobile POST, these are removed from the assembled tool set.
 *
 * Today this is a forward-looking reservation — `send_reply` lands in Sprint 2
 * Wk 5-6 (§3.5). Adding the name here now means the gate is live the moment
 * the tool ships; no second migration of `buildToolsForIntent` required.
 *
 * Add future voice-only tools here (not desktop-safe writes with confirm UI).
 */
export const VOICE_INTENT_TOOL_NAMES = [
  'send_reply',
] as const;

export type VoiceIntentToolName = typeof VOICE_INTENT_TOOL_NAMES[number];

/**
 * Extract the mobile-surface signal from an incoming request. Returns true
 * only when BOTH the x-aion-surface header and the User-Agent pass the
 * mobile checks. Exported for reuse by the regression test; the production
 * call site is the chat route handler.
 */
export function isMobileSurface(req: Request): boolean {
  return (
    hasMobileSurfaceHeader(req.headers) && isMobileUserAgent(req.headers.get('user-agent'))
  );
}

export function hasMobileSurfaceHeader(headers: Headers): boolean {
  return headers.get(MOBILE_SURFACE_HEADER) === MOBILE_SURFACE_VALUE;
}

export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return MOBILE_UA_REGEX.test(ua);
}

/**
 * Strip voice-intent tools from an assembled tool set when the request is not
 * from a mobile surface. Idempotent — safe to call when the tools aren't
 * present. Mutates in place to match the `buildToolsForIntent` pattern.
 */
export function stripVoiceIntentTools(tools: Record<string, unknown>): void {
  for (const name of VOICE_INTENT_TOOL_NAMES) {
    delete tools[name];
  }
}

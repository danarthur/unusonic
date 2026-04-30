/**
 * Aion chat route — synthetic-message handlers.
 *
 * Two short-circuit message shapes that bypass the LLM:
 * - Phase 3.1: `[arg-edit] <metricId> <argKey>=<value>` — re-runs callMetric
 *   with a single arg replaced (emitted by AnalyticsResultCard pill edits).
 * - Phase 3.3: `[open-pin] <pinId>` — re-renders a saved pin's metric result
 *   with the pinId stamped onto the fresh card so the "Update pin"
 *   affordance lights up (emitted when the user arrives via /aion?openPin=).
 */

import type {
  AionChatResponse,
  AionMessageContent,
} from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import { invokeCallMetric } from '../tools/analytics';
import { respondText } from './helpers';

// =============================================================================
// Phase 3.1: synthetic `[arg-edit]` message handling
// =============================================================================

export type ArgEdit = {
  metricId: string;
  argKey: string;
  rawValue: string;
};

/** Match `[arg-edit] <metricId> <argKey>=<value>`. Value runs to end-of-line. */
export function parseArgEditMessage(content: string): ArgEdit | null {
  const match = content.match(/^\[arg-edit\]\s+(\S+)\s+([A-Za-z_][A-Za-z0-9_]*)=([\s\S]+)$/);
  if (!match) return null;
  return { metricId: match[1], argKey: match[2], rawValue: match[3].trim() };
}

/** Parse a JSON-encoded period object into { period_start, period_end }. */
function parsePeriodEdit(rawValue: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawValue) as { period_start?: unknown; period_end?: unknown };
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, unknown> = {};
    if (typeof parsed.period_start === 'string') out.period_start = parsed.period_start;
    if (typeof parsed.period_end === 'string') out.period_end = parsed.period_end;
    return out;
  } catch {
    return {};
  }
}

/** Best-effort parse of an arbitrary raw value (JSON if possible, else string). */
function parseRawValue(rawValue: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch {
    return rawValue;
  }
}

/**
 * Build the args shape callMetric expects from a synthetic `[arg-edit]` message.
 *
 * Phase 3.1 note: the persisted chat history is free-text user + assistant
 * content; tool-result payloads are emitted over the stream but not replayed
 * verbatim in chat history. So we accept defaultArgs + the single edit; callers
 * that need non-default prior args should re-ask from scratch.
 */
function argsFromEdit(edit: ArgEdit): Record<string, unknown> {
  const { argKey, rawValue } = edit;
  if (argKey === 'period') return parsePeriodEdit(rawValue);
  if (argKey === 'year') {
    const n = Number(rawValue);
    return Number.isFinite(n) ? { year: Math.trunc(n) } : {};
  }
  return { [argKey]: parseRawValue(rawValue) };
}

export async function handleArgEdit(
  workspaceId: string,
  edit: ArgEdit,
): Promise<AionChatResponse> {
  const nextArgs = argsFromEdit(edit);
  const result = await invokeCallMetric(workspaceId, edit.metricId, nextArgs);

  if (result.kind === 'error') {
    return respondText(result.message);
  }
  if (result.kind === 'analytics_result') {
    return { messages: [result.block as AionMessageContent] };
  }
  if (result.kind === 'data_table' && result.block) {
    return { messages: [result.block as AionMessageContent] };
  }
  return respondText('Could not resolve that metric edit.');
}

// =============================================================================
// Phase 3.3: synthetic `[open-pin]` message handling
// =============================================================================

/** Match `[open-pin] <pinId>`. Pin id runs to end-of-line (uuid-shaped). */
export function parseOpenPinMessage(content: string): string | null {
  const match = content.match(/^\[open-pin\]\s+(\S+)\s*$/);
  return match ? match[1] : null;
}

export async function handleOpenPin(
  workspaceId: string,
  userId: string,
  pinId: string,
): Promise<AionChatResponse> {
  // Import lazily — this path is only hit when the synthetic turn fires.
  const { loadPinToAion } = await import(
    '@/app/(dashboard)/(features)/aion/actions/open-pin'
  );
  // loadPinToAion re-resolves the user from cookies, which matches the caller
  // (this route is already authenticated). We pass the pinId verbatim; the
  // action filters by (workspace, user) so a cross-user pin id returns null.
  void userId; // user scoping is enforced inside loadPinToAion
  void workspaceId;

  const pin = await loadPinToAion(pinId);
  if (!pin) {
    return respondText('I couldn\'t open that pin — it may have been removed.');
  }

  const result = await invokeCallMetric(workspaceId, pin.metricId, pin.args);
  if (result.kind === 'error') {
    return respondText(result.message);
  }
  if (result.kind === 'analytics_result') {
    // Stamp the pinId onto the fresh result so the card renders with the
    // "Update pin" affordance lit. Phase 3.2's AnalyticsResultCard reads this.
    const block = { ...result.block, pinId: pin.pinId } as AionMessageContent;
    return { messages: [block] };
  }
  if (result.kind === 'data_table' && result.block) {
    return { messages: [result.block as AionMessageContent] };
  }
  return respondText('Could not reopen that pin.');
}

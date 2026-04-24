/**
 * Refusal tool — Phase 3.4.
 *
 * Exposes `record_refusal`, the tool Aion calls when a user asks for something
 * outside the metric registry. It:
 *   1. Writes a row to `cortex.aion_refusal_log` via the system client so the
 *      refusal-rate metric (`ops.metric_aion_refusal_rate`) has data to chart.
 *   2. Returns a `refusal` content block the chat route attaches to the
 *      assistant message, rendered client-side by `RefusalCard`.
 *
 * The tool is a sibling of `call_metric` — they share the same intent
 * allow-lists (simple_lookup, analysis, multi_step, strategic) because refusal
 * is the fallback path when call_metric can't fire.
 *
 * @module app/api/aion/chat/tools/refusal
 */

import { tool } from 'ai';
import { z } from 'zod';
import { METRICS } from '@/shared/lib/metrics/registry';
import type { Refusal, SuggestionChip } from '@/app/(dashboard)/(features)/aion/lib/aion-chat-types';
import type { AionToolContext } from './types';

/** Common freeform refusal reasons. Aion may invent others — the DB column is text. */
const REFUSAL_REASONS = [
  'metric_not_in_registry',
  'insufficient_capability',
  'ambiguous_arg',
  'other',
] as const;

/**
 * Builds suggestion chips from a list of registry IDs Aion thinks are related.
 * Resolves titles from the registry so the chip label is human-readable without
 * the client having to re-resolve.
 *
 * Silently drops unknown IDs — Aion may occasionally hallucinate an ID that
 * isn't in the registry; surfacing those as broken chips would be worse than
 * just showing the ones that resolve.
 */
function suggestionChipsFor(ids: string[] | undefined): SuggestionChip[] {
  if (!ids || ids.length === 0) return [];
  const chips: SuggestionChip[] = [];
  for (const id of ids.slice(0, 3)) {
    const def = METRICS[id];
    if (!def) continue;
    chips.push({
      label: def.title,
      // Plain-language message; the chat pipeline interprets this as a normal
      // user turn and Aion will map it back to a call_metric on the next pass.
      value: `Show me ${def.title.toLowerCase()}`,
    });
  }
  return chips;
}

/**
 * Shape helper — exposed for tests. Resolves the attempted metric's title
 * (if present + registered) and returns the `refusal` content block.
 */
export function buildRefusalBlock(input: {
  question: string;
  reason: string;
  attemptedMetricId?: string;
  suggestions?: string[];
}): Refusal {
  const attemptedDef = input.attemptedMetricId
    ? METRICS[input.attemptedMetricId]
    : undefined;

  // Short, dry user-facing text. The registry lookup drives whether we mention
  // the near-match inline or not; the attempted chip below handles the CTA.
  const text = attemptedDef
    ? "I don't have a defined metric for that exactly."
    : "I don't have a defined metric for that.";

  return {
    type: 'refusal',
    text,
    reason: input.reason,
    ...(input.attemptedMetricId ? { attemptedMetricId: input.attemptedMetricId } : {}),
    ...(attemptedDef ? { attemptedMetricTitle: attemptedDef.title } : {}),
    suggestions: suggestionChipsFor(input.suggestions),
  };
}

/**
 * Writes the refusal to cortex.aion_refusal_log via the SECURITY DEFINER RPC.
 * Uses the system client: the RPC passes through service_role so the tool
 * works even when the chat route is running against a lightly-authed context
 * (e.g. mid-stream). Failure is logged but doesn't throw — a dropped log row
 * shouldn't break the user-facing refusal card.
 */
type PersistInput = {
  workspaceId: string;
  userId: string;
  question: string;
  reason: string;
  attemptedMetricId?: string;
};

async function persistRefusal(input: PersistInput): Promise<void> {
  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { error } = await system.schema('cortex').rpc('record_refusal', {
      p_workspace_id: input.workspaceId,
      p_user_id: input.userId,
      p_question: input.question,
      p_reason: input.reason,
      p_attempted_metric_id: input.attemptedMetricId ?? undefined,
    });
    if (error) {
      console.error('[aion/refusal] record_refusal failed:', error.message);
    }
  } catch (err) {
    console.error('[aion/refusal] record_refusal threw:', err);
  }
}

export function createRefusalTools(ctx: AionToolContext) {
  const record_refusal = tool({
    description:
      'Log a refusal when the user asks for a metric that is NOT in the REGISTRY METRICS list. ' +
      'Call this instead of fabricating an answer. Include an attempted_metric_id when a near-match exists ' +
      'and up to 3 suggestions (registry metric ids that are conceptually related). ' +
      'Never apologize at length — the UI surfaces the limitation dryly.',
    inputSchema: z.object({
      question: z
        .string()
        .min(1)
        .describe('The user question, as asked. Stored verbatim so we can expand the registry from real misses.'),
      reason: z
        .enum(REFUSAL_REASONS)
        .describe('Why you refused. Prefer metric_not_in_registry; use ambiguous_arg only after a clarifier failed.'),
      attempted_metric_id: z
        .string()
        .optional()
        .describe('Closest registry id, e.g. finance.revenue_collected. Omit if nothing is close.'),
      suggestions: z
        .array(z.string())
        .max(3)
        .optional()
        .describe('Up to 3 registry ids the user could try instead. Titles are resolved from the registry.'),
    }),
    execute: async (params) => {
      await persistRefusal({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        question: params.question,
        reason: params.reason,
        attemptedMetricId: params.attempted_metric_id,
      });
      const block = buildRefusalBlock({
        question: params.question,
        reason: params.reason,
        attemptedMetricId: params.attempted_metric_id,
        suggestions: params.suggestions,
      });
      return { refusal: block };
    },
  });

  return { record_refusal };
}

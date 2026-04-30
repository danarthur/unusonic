/**
 * Aion chat route — intent-based tool assembly.
 *
 * Split out of route.ts as part of the Phase 0.5 LOC trim. Builds only the
 * tool sets needed for the classified intent so simple queries don't pay the
 * ~3k-token cost of loading the full registry.
 */

import type { Intent } from '../../lib/models';
import { stripVoiceIntentTools } from '../../lib/surface-detection';
import { createCoreTools } from '../tools/core';
import { createKnowledgeTools } from '../tools/knowledge';
import { createActionTools } from '../tools/actions';
import { createEntityTools } from '../tools/entity';
import { createProductionTools } from '../tools/production';
import { createAnalyticsTools } from '../tools/analytics';
import { createRefusalTools } from '../tools/refusal';
import { createWriteTools } from '../tools/writes';
import type { AionToolContext } from '../tools/types';

export function buildToolsForIntent(
  intent: Intent,
  toolCtx: AionToolContext,
  canWrite: boolean,
  pageType: string | null,
  isMobile: boolean = false,
): Record<string, any> {
  // Always include core (voice config, memory, follow-ups, drafts) + knowledge (read-only lookups)
  const core = createCoreTools(toolCtx);
  const knowledge = createKnowledgeTools(toolCtx);
  const analytics = createAnalyticsTools(toolCtx);
  // Phase 3.4: record_refusal is wired wherever call_metric is wired — refusal
  // is the fallback path when the user asks for an out-of-registry metric.
  const refusal = createRefusalTools(toolCtx);

  let tools: Record<string, any>;
  switch (intent) {
    // Lightweight intents — core + knowledge only (no write/entity/production tools)
    case 'greeting':
    case 'rejection':
    case 'conversational':
      tools = { ...core, ...knowledge };
      break;

    // Simple lookup can ask for a scalar metric (revenue, AR, sync health)
    case 'simple_lookup':
      tools = { ...core, ...knowledge, ...analytics, ...refusal };
      break;

    // Draft requests — core has draft_follow_up + regenerate_draft; §3.5 write
    // tools (send_reply, schedule_followup, update_narrative) are also here
    // because drafting is cheap by design. The voice-intent gate downstream
    // strips send_reply on desktop.
    case 'draft_request':
      tools = { ...core, ...knowledge, ...createWriteTools(toolCtx) };
      break;

    // Config/teaching — core only (save_voice_config, save_memory, save_follow_up_rule)
    case 'config':
      tools = { ...core };
      break;

    // Write actions — need action + entity tools, plus knowledge for context lookups
    case 'write_action':
    case 'confirmation': {
      const actions = createActionTools(toolCtx);
      const entity = createEntityTools(toolCtx);
      const writes = createWriteTools(toolCtx);
      // Include production tools when on a deal/event page
      if (pageType === 'deal' || pageType === 'event') {
        const production = createProductionTools(toolCtx);
        tools = { ...core, ...knowledge, ...actions, ...entity, ...production, ...writes };
      } else {
        tools = { ...core, ...knowledge, ...actions, ...entity, ...writes };
      }
      break;
    }

    // Multi-step, analysis, strategic — full tool set (+ call_metric for analysis)
    case 'multi_step':
    case 'analysis':
    case 'strategic':
      tools = {
        ...core,
        ...knowledge,
        ...analytics,
        ...refusal,
        ...createActionTools(toolCtx),
        ...createEntityTools(toolCtx),
        ...createProductionTools(toolCtx),
        ...createWriteTools(toolCtx),
      };
      break;

    default:
      tools = { ...core, ...knowledge };
  }

  // Phase 3 §3.4 B3 — voice-intent tools (send_reply, future voice-only writes)
  // are stripped unless the request is verified mobile (header + UA). Even if
  // an intent classifier would include them, a desktop POST never surfaces
  // them. See src/app/api/aion/lib/surface-detection.ts.
  if (!isMobile) {
    stripVoiceIntentTools(tools);
  }

  // canWrite is reserved for future per-tool gating; tool-level gating today
  // is enforced inside individual tool handlers via toolCtx.canWrite.
  void canWrite;

  return tools;
}

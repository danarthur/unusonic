/**
 * Pure helpers for Aion voice config — split out of aion-config-actions.ts
 * because Next.js 16 requires every export from a 'use server' module to be
 * async. These two are sync-by-design (pure synthesis from workspace name +
 * pure config merge) and don't belong in the server-action surface.
 */

import type { AionConfig, AionVoiceConfig } from './aion-config-actions';

/**
 * Synthesize a default AionVoiceConfig from the workspace name. Used when
 * `aion_config.voice` is empty and we want to skip the 4-step onboarding
 * forcing block. Owner can retune via the Sidebar overflow ("Tune Aion's
 * voice") which calls resetAionVoiceConfig and re-enters the explicit flow.
 *
 * Note: the plan also referenced workspace.industry_tags, but no such column
 * exists today. Skipping industry framing keeps the synth tight; if industry
 * data lands later, this helper is the single update site.
 */
export function synthesizeDefaultVoice(workspaceName: string): AionVoiceConfig {
  const company = (workspaceName ?? '').trim() || 'this production company';
  return {
    description: `Writing for ${company}. Sentence case, no exclamation marks, precise production vocabulary. Never generic B2B.`,
    example_message: `Hi {first_name} — checking in on the proposal we sent over. Let me know if any of it needs a tweak before we lock the date.`,
    guardrails: 'Never invent prices, dates, or crew assignments. Quote numbers verbatim from the deal record. Confirm before any send.',
  };
}

/**
 * Inject a synthesized default voice into the config when no voice is stored.
 * Pure function — never mutates the input. The DB row is left untouched on
 * disk; synthesis happens on every read so workspace renames flow through
 * automatically.
 */
export function applyVoiceDefaultIfEmpty(
  config: AionConfig,
  workspaceName: string,
): AionConfig {
  if (config.voice?.description) return config;
  return {
    ...config,
    voice: synthesizeDefaultVoice(workspaceName),
    voice_default_derived: true,
  };
}

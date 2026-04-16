/**
 * Code-defined Lobby presets. Task-oriented (not role-oriented). Users see
 * presets whose requiredCapabilities they hold — the switcher hides when only
 * Default is visible, so minimal roles get no UI clutter.
 *
 * Default renders via the legacy hardcoded bento (LegacyBentoGrid) — preserved
 * byte-for-byte for users who don't engage with layouts. Everything else
 * renders via the modular renderer against the metric registry.
 *
 * Every cardId across all presets has been verified to exist in METRICS
 * (src/shared/lib/metrics/registry.ts). Adding a preset card: verify the id
 * is registered, then add it here — do not invent ids.
 *
 * @module shared/lib/lobby-layouts/presets
 */

import type { LayoutPreset, PresetSlug } from './types';

export const PRESETS: Record<PresetSlug, LayoutPreset> = {
  default: {
    slug: 'default',
    name: 'Default',
    description:
      'The general overview — schedule, pipeline, finance pulse, activity.',
    cardIds: [], // legacy bento owns its own hardcoded layout
    requiredCapabilities: [],
    rendererMode: 'legacy',
  },
  sales: {
    slug: 'sales',
    name: 'Sales',
    description:
      'Pipeline, proposals, revenue attribution, client concentration.',
    cardIds: [
      'lobby.deal_pipeline',
      'lobby.pipeline_velocity',
      'lobby.passive_pipeline_feed',
      'finance.revenue_collected',
      'finance.revenue_by_lead_source',
      'lobby.client_concentration',
      'lobby.action_queue',
      'lobby.activity_feed',
    ],
    requiredCapabilities: ['deals:read:global'],
    rendererMode: 'modular',
  },
  production: {
    slug: 'production',
    name: 'Production',
    description: "Today's schedule, crew, logistics, show control.",
    cardIds: [
      'lobby.today_schedule',
      'lobby.week_strip',
      'lobby.real_time_logistics',
      'lobby.action_queue',
      'lobby.production_timeline',
      'lobby.active_production',
      'lobby.urgency_strip',
      'lobby.network_stream',
    ],
    requiredCapabilities: ['planning:view'],
    rendererMode: 'modular',
  },
  finance: {
    slug: 'finance',
    name: 'Finance',
    description:
      'AR aging, QBO sync, unreconciled payments, month-end reconciliation.',
    cardIds: [
      'finance.qbo_sync_health',
      'finance.qbo_variance',
      'finance.ar_aged_60plus',
      'finance.unreconciled_payments',
      'lobby.payment_health',
      'finance.revenue_collected',
      'finance.invoice_variance',
      'lobby.action_queue',
    ],
    requiredCapabilities: ['finance:view'],
    rendererMode: 'modular',
  },
};

/** Iteration order for the switcher. Default always first. */
export const PRESET_SLUGS: PresetSlug[] = [
  'default',
  'sales',
  'production',
  'finance',
];

/** Hard cap on cards per layout — applies to customs. */
export const LOBBY_CARD_CAP = 12;

/** Hard cap on how many customs a single user may have per workspace. */
export const CUSTOM_LAYOUTS_PER_USER_CAP = 10;

/**
 * Seed card set used when a user duplicates Default into a custom. The legacy
 * hardcoded bento is not expressible as an ordered cardId list, so we seed the
 * richest generally-useful admin set instead of an empty layout. Users can
 * immediately edit, remove, or reorder.
 */
export const DEFAULT_DUPLICATE_SEED: string[] = [
  'lobby.today_schedule',
  'lobby.week_strip',
  'lobby.action_queue',
  'lobby.deal_pipeline',
  'lobby.financial_pulse',
  'lobby.activity_feed',
  'lobby.revenue_trend',
  'lobby.client_concentration',
];

/** True when the slug refers to a code-defined preset. */
export function isPresetSlug(value: string): value is PresetSlug {
  return PRESET_SLUGS.includes(value as PresetSlug);
}

/**
 * Lobby layout contract — shared between server actions, the switcher, and
 * the renderer. Frozen shape; mirrored by the frontend agent's consumer.
 *
 * Two concepts:
 *   1. Preset — frozen, code-defined layouts (see ./presets.ts). 'default'
 *      renders via the legacy hardcoded bento; the other three render modular
 *      against the metric registry, each gated on one capability.
 *   2. Custom — user-created, named, editable, max 10 per (user, workspace).
 *
 * listVisibleLayouts() collapses presets + customs behind the unified
 * LobbyLayout shape. Exactly one entry in the returned array has
 * isActive: true.
 *
 * @module shared/lib/lobby-layouts/types
 */

import type { CapabilityKey } from '@/shared/lib/permission-registry';

/** Preset slugs. 'default' is legacy; the rest are modular. */
export type PresetSlug = 'default' | 'sales' | 'production' | 'finance';

/** How a layout renders. 'legacy' is only for the Default preset. */
export type RendererMode = 'legacy' | 'modular';

/**
 * Code-defined preset. Customs copy cardIds off a preset (or start blank).
 * The switcher filters presets by capability, so a member who cannot read
 * finance never sees the Finance preset in the list.
 */
export type LayoutPreset = {
  slug: PresetSlug;
  /** Display name — 'Default', 'Sales', 'Production', 'Finance'. */
  name: string;
  /** Short copy for the switcher tooltip. */
  description: string;
  /** Ordered registry ids; empty for Default (legacy bento owns its layout). */
  cardIds: string[];
  /** Capabilities the caller must hold for the preset to appear in the switcher. */
  requiredCapabilities: CapabilityKey[];
  rendererMode: RendererMode;
};

/**
 * Unified shape returned to the client — presets and customs both.
 *
 * `id` is a preset slug for presets and a lobby_layouts.id uuid for customs.
 * The two spaces never collide (slugs are short words, ids are uuids), so the
 * client keys off `id` alone without a compound key.
 */
export type LobbyLayout = {
  /** Preset slug for presets, custom uuid for customs. Unique across both. */
  id: string;
  kind: 'preset' | 'custom';
  /** Editable for customs; fixed for presets. */
  name: string;
  /** Empty for Default (legacy renderer owns its own card set). */
  cardIds: string[];
  /** Customs only — the slug they were duplicated from, if any. */
  sourcePresetSlug?: PresetSlug;
  isActive: boolean;
  /** 'legacy' only for the Default preset; 'modular' for everything else. */
  rendererMode: RendererMode;
  /** Customs only (ISO). Presets leave these undefined. */
  createdAt?: string;
  updatedAt?: string;
};

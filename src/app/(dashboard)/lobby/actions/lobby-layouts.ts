'use server';

/**
 * Lobby layout server actions — presets + customs.
 *
 * Replaces the persona-based lobby-layout.ts. Users see:
 *   1. Code-defined presets (./types.ts + ./presets.ts) filtered by capability.
 *   2. Their own customs from public.lobby_layouts.
 * Exactly one layout is active at a time, tracked by public.user_lobby_active.
 *
 * Contract: see src/shared/lib/lobby-layouts/types.ts. The frontend agent
 * consumes the returned LobbyLayout shape and these server action signatures
 * verbatim; do not deviate.
 *
 * Validation rules (server-enforced):
 *   - Max 10 customs per (user, workspace).
 *   - Max 12 cards per layout.
 *   - Every cardId must exist in METRICS, and the caller must hold every
 *     requiredCapability for the card.
 *   - Preset slugs cannot be renamed or deleted.
 *   - Layout names are unique per (user, workspace) — enforced by the unique
 *     constraint; surfaced as a user-readable error on conflict.
 *
 * Helpers live in ./_lobby-layouts-internals to keep this file under the
 * file-size ratchet.
 *
 * @module app/(dashboard)/lobby/actions/lobby-layouts
 */

import { createClient } from '@/shared/api/supabase/server';
import { METRICS } from '@/shared/lib/metrics/registry';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';
import type {
  LobbyLayout,
  PresetSlug,
} from '@/shared/lib/lobby-layouts/types';
import {
  PRESETS,
  CUSTOM_LAYOUTS_PER_USER_CAP,
  DEFAULT_DUPLICATE_SEED,
  isPresetSlug,
} from '@/shared/lib/lobby-layouts/presets';
import {
  type CustomRow,
  countCustoms,
  customRowToLayout,
  isUniqueViolation,
  loadActiveKey,
  loadCustoms,
  loadOwnedCustom,
  presetToLayout,
  resolveContext,
  validateCardIds,
  validateName,
  visiblePresetSlugs,
  writeActiveKey,
} from './_lobby-layouts-internals';

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns the union of presets the caller has capability for and the caller's
 * customs, with exactly one `isActive: true`. Falls back to 'default' when no
 * active pointer exists or when the persisted active key no longer resolves
 * (preset cap lost, custom deleted).
 */
export async function listVisibleLayouts(): Promise<LobbyLayout[]> {
  const { userId, workspaceId } = await resolveContext();
  const [slugs, customs, activeKey] = await Promise.all([
    visiblePresetSlugs(workspaceId),
    loadCustoms(userId, workspaceId),
    loadActiveKey(userId, workspaceId),
  ]);

  const allIds = new Set<string>([
    ...slugs.map((s) => s as string),
    ...customs.map((c) => c.id),
  ]);
  const resolvedActive = allIds.has(activeKey) ? activeKey : 'default';

  const presetLayouts: LobbyLayout[] = slugs.map((slug) =>
    presetToLayout(slug, slug === resolvedActive),
  );
  const customLayouts: LobbyLayout[] = customs.map((row) =>
    customRowToLayout(row, row.id === resolvedActive),
  );

  return [...presetLayouts, ...customLayouts];
}

/**
 * Sets the active layout pointer. Accepts a preset slug the caller has
 * capability for, or a custom uuid the caller owns. Unknown / unauthorized
 * ids raise a user-readable error.
 */
export async function activateLayout(id: string): Promise<void> {
  if (!id || typeof id !== 'string') throw new Error('id is required');
  const { userId, workspaceId } = await resolveContext();

  if (isPresetSlug(id)) {
    const caps = await userCapabilities(workspaceId);
    const preset = PRESETS[id];
    const missing = preset.requiredCapabilities.find((cap) => !caps.has(cap));
    if (missing) {
      throw new Error(
        `You don't have access to the ${preset.name} layout (needs ${missing})`,
      );
    }
    await writeActiveKey(userId, workspaceId, id);
    return;
  }

  await loadOwnedCustom(id, userId, workspaceId);
  await writeActiveKey(userId, workspaceId, id);
}

/**
 * Creates a new custom from a preset's card list (or the DEFAULT_DUPLICATE_SEED
 * when duplicating Default, since legacy bento isn't expressible as cardIds).
 * Activates the new custom and returns it.
 */
export async function createLayoutFromPreset(
  slug: PresetSlug,
  name?: string,
): Promise<LobbyLayout> {
  if (!isPresetSlug(slug)) throw new Error(`Unknown preset: ${slug}`);
  const { userId, workspaceId } = await resolveContext();

  const caps = await userCapabilities(workspaceId);
  const preset = PRESETS[slug];
  const missingCap = preset.requiredCapabilities.find((cap) => !caps.has(cap));
  if (missingCap) {
    throw new Error(
      `You don't have access to the ${preset.name} layout (needs ${missingCap})`,
    );
  }

  const existing = await countCustoms(userId, workspaceId);
  if (existing >= CUSTOM_LAYOUTS_PER_USER_CAP) {
    throw new Error(
      `You've hit the limit of ${CUSTOM_LAYOUTS_PER_USER_CAP} custom layouts. Delete one to make room.`,
    );
  }

  const finalName = validateName(name ?? `My ${preset.name}`);
  // Default's legacy bento isn't expressible as an ordered cardId list;
  // seed the richest generally-useful admin set instead of an empty layout.
  const seedCards = slug === 'default' ? DEFAULT_DUPLICATE_SEED : preset.cardIds;

  // Drop any seed ids the user can't see — e.g. a finance-less user duplicating
  // Default should not land on finance cards. Preserves order.
  const filteredCards = seedCards.filter((id) => {
    const def = METRICS[id];
    if (!def) return false;
    return def.requiredCapabilities.every((cap) => caps.has(cap));
  });

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('lobby_layouts')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: finalName,
      source_preset_slug: slug,
      card_ids: filteredCards,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, name, source_preset_slug, card_ids, created_at, updated_at')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`A layout named "${finalName}" already exists`);
    }
    throw new Error(`Could not create layout: ${error.message}`);
  }

  await writeActiveKey(userId, workspaceId, data.id);
  return customRowToLayout(data as CustomRow, true);
}

/**
 * Creates a blank custom (no cards) with the given name. Activates it and
 * returns the new layout. Rejects empty / too-long names and over-cap users.
 */
export async function createBlankLayout(name: string): Promise<LobbyLayout> {
  const finalName = validateName(name);
  const { userId, workspaceId } = await resolveContext();

  const existing = await countCustoms(userId, workspaceId);
  if (existing >= CUSTOM_LAYOUTS_PER_USER_CAP) {
    throw new Error(
      `You've hit the limit of ${CUSTOM_LAYOUTS_PER_USER_CAP} custom layouts. Delete one to make room.`,
    );
  }

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('lobby_layouts')
    .insert({
      user_id: userId,
      workspace_id: workspaceId,
      name: finalName,
      source_preset_slug: null,
      card_ids: [],
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id, name, source_preset_slug, card_ids, created_at, updated_at')
    .single();
  if (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`A layout named "${finalName}" already exists`);
    }
    throw new Error(`Could not create layout: ${error.message}`);
  }

  await writeActiveKey(userId, workspaceId, data.id);
  return customRowToLayout(data as CustomRow, true);
}

/**
 * Renames a custom. Rejects preset slugs, empty / too-long names, and duplicate
 * names (via the (user_id, workspace_id, name) unique constraint).
 */
export async function renameLayout(id: string, name: string): Promise<void> {
  if (isPresetSlug(id)) {
    throw new Error('Preset layouts cannot be renamed');
  }
  const finalName = validateName(name);
  const { userId, workspaceId } = await resolveContext();
  await loadOwnedCustom(id, userId, workspaceId);

  const supabase = await createClient();
  const { error } = await supabase
    .from('lobby_layouts')
    .update({ name: finalName, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId);
  if (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`A layout named "${finalName}" already exists`);
    }
    throw new Error(`Could not rename layout: ${error.message}`);
  }
}

/**
 * Overwrites a custom's ordered card list. Validates every cardId exists,
 * caller holds capability for each, and the list fits the cap.
 */
export async function saveCustomLayout(
  id: string,
  cardIds: string[],
): Promise<void> {
  if (isPresetSlug(id)) {
    throw new Error('Preset layouts are read-only');
  }
  const { userId, workspaceId } = await resolveContext();
  // Ownership check first so unauthorized ids don't leak validation errors.
  await loadOwnedCustom(id, userId, workspaceId);
  await validateCardIds(cardIds, workspaceId);

  const supabase = await createClient();
  const { error } = await supabase
    .from('lobby_layouts')
    .update({ card_ids: cardIds, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`Could not save layout: ${error.message}`);
}

/**
 * Deletes a custom. Rejects preset slugs. If the deleted custom was active,
 * the active pointer falls back to 'default'.
 */
export async function deleteLayout(id: string): Promise<void> {
  if (isPresetSlug(id)) {
    throw new Error('Preset layouts cannot be deleted');
  }
  const { userId, workspaceId } = await resolveContext();
  await loadOwnedCustom(id, userId, workspaceId);

  const supabase = await createClient();
  const { error } = await supabase
    .from('lobby_layouts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`Could not delete layout: ${error.message}`);

  const activeKey = await loadActiveKey(userId, workspaceId);
  if (activeKey === id) {
    await writeActiveKey(userId, workspaceId, 'default');
  }
}

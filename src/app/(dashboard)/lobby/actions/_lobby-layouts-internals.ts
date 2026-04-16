import 'server-only';

/**
 * Shared internals for lobby-layouts server actions. Split out to keep the
 * public action file within the file-size ratchet. Not marked 'use server'
 * because it exports helper functions (not actions) that the action file
 * composes server-side.
 *
 * @module app/(dashboard)/lobby/actions/_lobby-layouts-internals
 */

import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { METRICS } from '@/shared/lib/metrics/registry';
import { userCapabilities } from '@/shared/lib/metrics/capabilities';
import type {
  LobbyLayout,
  PresetSlug,
} from '@/shared/lib/lobby-layouts/types';
import {
  PRESETS,
  PRESET_SLUGS,
  LOBBY_CARD_CAP,
  isPresetSlug,
} from '@/shared/lib/lobby-layouts/presets';

export type Ctx = { userId: string; workspaceId: string };

export type CustomRow = {
  id: string;
  name: string;
  source_preset_slug: string | null;
  card_ids: string[];
  created_at: string;
  updated_at: string;
};

/**
 * Resolves the signed-in user and their active workspace. Throws with a
 * user-readable message on missing auth / missing workspace / missing
 * membership so every action surfaces a consistent error.
 */
export async function resolveContext(): Promise<Ctx> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const cookieStore = await cookies();
  let workspaceId = cookieStore.get('workspace_id')?.value ?? null;

  // Fallback to first membership when the cookie is unset (e.g. first request
  // after login before the workspace switcher writes it).
  if (!workspaceId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    workspaceId = membership?.workspace_id ?? null;
  }
  if (!workspaceId) throw new Error('No workspace for current user');

  const { data: member, error: memberErr } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberErr || !member) {
    throw new Error('Not a member of this workspace');
  }

  return { userId: user.id, workspaceId };
}

export function customRowToLayout(
  row: CustomRow,
  isActive: boolean,
): LobbyLayout {
  const slug = row.source_preset_slug;
  const sourcePresetSlug =
    slug && isPresetSlug(slug) ? (slug as PresetSlug) : undefined;
  return {
    id: row.id,
    kind: 'custom',
    name: row.name,
    cardIds: row.card_ids ?? [],
    sourcePresetSlug,
    isActive,
    rendererMode: 'modular',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function presetToLayout(
  slug: PresetSlug,
  isActive: boolean,
): LobbyLayout {
  const p = PRESETS[slug];
  return {
    id: p.slug,
    kind: 'preset',
    name: p.name,
    cardIds: p.cardIds,
    isActive,
    rendererMode: p.rendererMode,
  };
}

/**
 * Validates a card-id list against the registry and the caller's caps.
 * Throws on unknown ids, missing capabilities, duplicates, or over-cap.
 */
export async function validateCardIds(
  cardIds: string[],
  workspaceId: string,
): Promise<void> {
  if (!Array.isArray(cardIds)) throw new Error('cardIds must be an array');
  if (cardIds.length > LOBBY_CARD_CAP) {
    throw new Error(`At most ${LOBBY_CARD_CAP} cards allowed on a layout`);
  }

  const seen = new Set<string>();
  for (const id of cardIds) {
    if (seen.has(id)) throw new Error(`Duplicate card: ${id}`);
    seen.add(id);
  }

  const unknown = cardIds.filter((id) => !METRICS[id]);
  if (unknown.length > 0) {
    throw new Error(`Unknown metric ids: ${unknown.join(', ')}`);
  }

  const caps = await userCapabilities(workspaceId);
  const missing: string[] = [];
  for (const id of cardIds) {
    const def = METRICS[id];
    for (const cap of def.requiredCapabilities) {
      if (!caps.has(cap)) {
        missing.push(`${id} (needs ${cap})`);
        break;
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing capability for: ${missing.join(', ')}`);
  }
}

export function validateName(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('Name is required');
  if (trimmed.length > 60) {
    throw new Error('Name must be 60 characters or fewer');
  }
  return trimmed;
}

export async function visiblePresetSlugs(
  workspaceId: string,
): Promise<PresetSlug[]> {
  const caps = await userCapabilities(workspaceId);
  return PRESET_SLUGS.filter((slug) =>
    PRESETS[slug].requiredCapabilities.every((cap) => caps.has(cap)),
  );
}

export async function loadCustoms(
  userId: string,
  workspaceId: string,
): Promise<CustomRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lobby_layouts')
    .select('id, name, source_preset_slug, card_ids, created_at, updated_at')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not load customs: ${error.message}`);
  return (data ?? []) as CustomRow[];
}

export async function loadActiveKey(
  userId: string,
  workspaceId: string,
): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('user_lobby_active')
    .select('layout_key')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data?.layout_key ?? 'default';
}

export async function writeActiveKey(
  userId: string,
  workspaceId: string,
  layoutKey: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('user_lobby_active')
    .upsert(
      {
        user_id: userId,
        workspace_id: workspaceId,
        layout_key: layoutKey,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,workspace_id' },
    );
  if (error) throw new Error(`Could not activate layout: ${error.message}`);
}

export async function loadOwnedCustom(
  id: string,
  userId: string,
  workspaceId: string,
): Promise<CustomRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lobby_layouts')
    .select('id, name, source_preset_slug, card_ids, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw new Error(`Could not load layout: ${error.message}`);
  if (!data) throw new Error('Layout not found');
  return data as CustomRow;
}

export async function countCustoms(
  userId: string,
  workspaceId: string,
): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('lobby_layouts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId);
  if (error) throw new Error(`Could not count layouts: ${error.message}`);
  return count ?? 0;
}

export function isUniqueViolation(err: {
  code?: string;
  message?: string;
}): boolean {
  if (err.code === '23505') return true;
  return /duplicate key|unique constraint/i.test(err.message ?? '');
}

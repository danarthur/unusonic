'use server';

import 'server-only';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

const addPresetSchema = z.object({
  skill_tag: z.string().min(1).max(120),
});

const removePresetSchema = z.object({
  preset_id: z.string().uuid(),
});

export type PresetActionResult = { ok: true } | { ok: false; error: string };

// =============================================================================
// listWorkspaceSkillPresets — callable from client components (via server action)
// =============================================================================

export async function listWorkspaceSkillPresets(): Promise<string[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('workspace_skill_presets')
    .select('skill_tag')
    .eq('workspace_id', workspaceId)
    .order('skill_tag');

  return (data ?? []).map((r: { skill_tag: string }) => r.skill_tag);
}

export async function addWorkspaceSkillPreset(
  input: unknown
): Promise<PresetActionResult> {
  const parsed = addPresetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_skill_presets')
    .insert({
      workspace_id: workspaceId,
      skill_tag: parsed.data.skill_tag.trim(),
    });

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Skill already exists in presets.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeWorkspaceSkillPreset(
  input: unknown
): Promise<PresetActionResult> {
  const parsed = removePresetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const supabase = await createClient();
  // Scope by workspace_id in addition to preset id — guards against cross-workspace delete.
  const { error } = await supabase
    .schema('ops')
    .from('workspace_skill_presets')
    .delete()
    .eq('id', parsed.data.preset_id)
    .eq('workspace_id', workspaceId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

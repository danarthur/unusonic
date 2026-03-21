'use server';

import 'server-only';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';

const addPresetSchema = z.object({
  workspace_id: z.string().uuid(),
  skill_tag: z.string().min(1).max(120),
});

const removePresetSchema = z.object({
  preset_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

export type PresetActionResult = { ok: true } | { ok: false; error: string };

export async function addWorkspaceSkillPreset(
  input: unknown
): Promise<PresetActionResult> {
  const parsed = addPresetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_skill_presets')
    .insert({
      workspace_id: parsed.data.workspace_id,
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

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_skill_presets')
    .delete()
    .eq('id', parsed.data.preset_id)
    .eq('workspace_id', parsed.data.workspace_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

'use server';

import 'server-only';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { CrewSkillDTO } from '@/entities/talent';

// =============================================================================
// Schemas
// =============================================================================

const SKILL_LEVELS = ['junior', 'mid', 'senior', 'lead'] as const;

const addCrewSkillSchema = z.object({
  entity_id: z.string().uuid(),
  skill_tag: z.string().min(1).max(120),
  proficiency: z.enum(SKILL_LEVELS).optional(),
  hourly_rate: z.number().positive().optional(),
  notes: z.string().max(500).optional(),
});

const removeCrewSkillSchema = z.object({
  crew_skill_id: z.string().uuid(),
});

const updateCrewSkillProficiencySchema = z.object({
  crew_skill_id: z.string().uuid(),
  proficiency: z.enum(SKILL_LEVELS),
});

// =============================================================================
// Helpers
// =============================================================================

/**
 * Refresh the denormalized skill snapshot on directory.entities.attributes.skills.
 * Called after every add/remove mutation so the entity card and crew search stay
 * in sync without a separate read path.
 */
async function refreshSkillSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  entityId: string,
  workspaceId: string
): Promise<void> {
  const { data: allSkills } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('skill_tag')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .order('skill_tag');

  await supabase.rpc('patch_entity_attributes', {
    p_entity_id: entityId,
    p_attributes: { skills: (allSkills ?? []).map((r: { skill_tag: string }) => r.skill_tag) },
  });
}

// =============================================================================
// addCrewSkill
// =============================================================================

export type CrewSkillAddResult = { ok: true; id: string } | { ok: false; error: string };

export async function addCrewSkill(
  input: unknown
): Promise<CrewSkillAddResult> {
  // 1. Validate
  const parsed = addCrewSkillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  // 2. Resolve workspace
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  // 3. Mutate
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('crew_skills')
    .insert({
      entity_id: parsed.data.entity_id,
      workspace_id: workspaceId,
      skill_tag: parsed.data.skill_tag.trim(),
      proficiency: parsed.data.proficiency ?? null,
      hourly_rate: parsed.data.hourly_rate ?? null,
      notes: parsed.data.notes ?? null,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Skill already added.' };
    return { ok: false, error: error.message };
  }

  // 4. Refresh denormalized snapshot
  await refreshSkillSnapshot(supabase, parsed.data.entity_id, workspaceId);

  return { ok: true, id: data.id };
}

// =============================================================================
// removeCrewSkill
// =============================================================================

export type CrewSkillMutateResult = { ok: true } | { ok: false; error: string };

export async function removeCrewSkill(
  input: unknown
): Promise<CrewSkillMutateResult> {
  // 1. Validate
  const parsed = removeCrewSkillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  // 2. Resolve workspace
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  const supabase = await createClient();

  // 3. Read row to get entity_id + verify workspace ownership
  const { data: row } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('entity_id, workspace_id')
    .eq('id', parsed.data.crew_skill_id)
    .single();

  if (!row) return { ok: false, error: 'Skill not found.' };
  if (row.workspace_id !== workspaceId) return { ok: false, error: 'Not authorised.' };

  // 4. Delete
  const { error } = await supabase
    .schema('ops')
    .from('crew_skills')
    .delete()
    .eq('id', parsed.data.crew_skill_id);

  if (error) return { ok: false, error: error.message };

  // 5. Refresh denormalized snapshot
  await refreshSkillSnapshot(supabase, row.entity_id, workspaceId);

  return { ok: true };
}

// =============================================================================
// updateCrewSkillProficiency
// =============================================================================

export async function updateCrewSkillProficiency(
  input: unknown
): Promise<CrewSkillMutateResult> {
  // 1. Validate
  const parsed = updateCrewSkillProficiencySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  // 2. Resolve workspace
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'Not signed in.' };

  const supabase = await createClient();

  // 3. Read row to verify workspace ownership
  const { data: row } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('entity_id, workspace_id')
    .eq('id', parsed.data.crew_skill_id)
    .single();

  if (!row) return { ok: false, error: 'Skill not found.' };
  if (row.workspace_id !== workspaceId) return { ok: false, error: 'Not authorised.' };

  // 4. Update proficiency
  const { error } = await supabase
    .schema('ops')
    .from('crew_skills')
    .update({ proficiency: parsed.data.proficiency })
    .eq('id', parsed.data.crew_skill_id);

  if (error) return { ok: false, error: error.message };

  // No snapshot refresh needed — snapshot only stores skill tags, not proficiency

  return { ok: true };
}

// =============================================================================
// getCrewSkillsForEntity
// =============================================================================

export async function getCrewSkillsForEntity(entityId: string): Promise<CrewSkillDTO[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('id, skill_tag, proficiency, hourly_rate, verified, notes')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .order('skill_tag');

  return (data ?? []) as CrewSkillDTO[];
}

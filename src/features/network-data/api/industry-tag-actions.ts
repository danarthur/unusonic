'use server';

import 'server-only';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';

export type IndustryTagActionResult = { ok: true } | { ok: false; error: string };

const addTagSchema = z.object({
  workspace_id: z.string().uuid(),
  tag: z.string().min(1).max(80).regex(/^[a-z0-9_]+$/, 'Tag must be lowercase letters, numbers, and underscores only.'),
  label: z.string().min(1).max(80),
});

const removeTagSchema = z.object({
  tag_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
});

const stripTagSchema = z.object({
  workspace_id: z.string().uuid(),
  tag: z.string().min(1).max(80),
});

/**
 * Add a new tag to the workspace dictionary. Owner/admin only.
 * RLS enforces the role check — this will 403 for regular members.
 */
export async function addWorkspaceIndustryTag(
  input: unknown
): Promise<IndustryTagActionResult> {
  const parsed = addTagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_industry_tags')
    .insert({
      workspace_id: parsed.data.workspace_id,
      tag: parsed.data.tag,
      label: parsed.data.label.trim(),
    });

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A tag with that key already exists.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Delete a tag from the workspace dictionary with no cascade.
 * Only safe to call when countIndustryTagUsage returns 0.
 */
export async function removeWorkspaceIndustryTag(
  input: unknown
): Promise<IndustryTagActionResult> {
  const parsed = removeTagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('workspace_industry_tags')
    .delete()
    .eq('id', parsed.data.tag_id)
    .eq('workspace_id', parsed.data.workspace_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Count how many cortex.relationships edges in this workspace currently carry this tag.
 * Shown in the delete confirmation dialog before calling stripAndRemoveIndustryTag.
 */
export async function countIndustryTagUsage(
  workspaceId: string,
  tag: string
): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id', { count: 'exact', head: true })
    .filter('context_data', 'cs', JSON.stringify({ industry_tags: [tag] }));

  return count ?? 0;
}

/**
 * Patch industry_tags on a specific cortex.relationships edge, identified by its UUID.
 * Uses the same upsert_relationship pattern as updateRelationshipNotes — looks up the
 * current edge, merges the new tags, and re-upserts. Used by IndustryTagsCard in the
 * detail sheet where only relationshipId is available (not raw entity IDs).
 */
export async function patchTagsOnRelationship(
  relationshipId: string,
  tags: string[]
): Promise<IndustryTagActionResult> {
  const supabase = await createClient();

  const { data: rel } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId)
    .maybeSingle();

  if (!rel) return { ok: false, error: 'Relationship not found.' };

  const existingCtx = (rel.context_data as Record<string, unknown>) ?? {};

  const { error } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: rel.source_entity_id,
    p_target_entity_id: rel.target_entity_id,
    p_type: rel.relationship_type,
    p_context_data: { ...existingCtx, industry_tags: tags.length > 0 ? tags : null },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Patch client_type on a CLIENT cortex.relationships edge, identified by its UUID.
 * Used by ClientTypeCard in the detail sheet.
 */
export async function patchClientTypeOnRelationship(
  relationshipId: string,
  clientType: string | null
): Promise<IndustryTagActionResult> {
  const supabase = await createClient();

  const { data: rel } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', relationshipId)
    .maybeSingle();

  if (!rel) return { ok: false, error: 'Relationship not found.' };

  const existingCtx = (rel.context_data as Record<string, unknown>) ?? {};

  const { error } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: rel.source_entity_id,
    p_target_entity_id: rel.target_entity_id,
    p_type: rel.relationship_type,
    p_context_data: { ...existingCtx, client_type: clientType },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Cascade-delete a tag: strips it from all relationship edges in the workspace, then
 * removes the dictionary row. Calls the strip_industry_tag SECURITY DEFINER RPC.
 * Owner/admin only — the RPC enforces this server-side.
 */
export async function stripAndRemoveIndustryTag(
  input: unknown
): Promise<IndustryTagActionResult> {
  const parsed = stripTagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('strip_industry_tag', {
    p_workspace_id: parsed.data.workspace_id,
    p_tag: parsed.data.tag,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Merge p_from_tag into p_to_tag across the workspace:
 * re-tags all edges, then deletes the dictionary row for the source tag.
 * Calls the merge_industry_tags SECURITY DEFINER RPC.
 * Owner/admin only — the RPC enforces this server-side.
 */
export async function mergeIndustryTags(
  workspaceId: string,
  fromTag: string,
  toTag: string,
): Promise<IndustryTagActionResult> {
  if (!workspaceId || !fromTag || !toTag) {
    return { ok: false, error: 'Missing required fields.' };
  }
  if (fromTag === toTag) {
    return { ok: false, error: 'Source and destination tags must be different.' };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('merge_industry_tags', {
    p_workspace_id: workspaceId,
    p_from_tag: fromTag,
    p_to_tag: toTag,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

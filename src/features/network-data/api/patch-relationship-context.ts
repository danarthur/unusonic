'use server';

import { createClient } from '@/shared/api/supabase/server';

/**
 * Merges a JSONB patch into a cortex.relationships context_data field.
 *
 * Unmentioned keys are preserved — this is a surgical update, not a replace.
 * The RPC enforces that the caller holds owner or admin in the source entity's
 * workspace; it will throw if not authorized.
 *
 * Typical use cases:
 *   - Update job_title on a ROSTER_MEMBER edge
 *   - Update skill_tags on a ROSTER_MEMBER edge
 *   - Update hourly_rate on a ROSTER_MEMBER edge
 *
 * @returns true if the edge was found and updated; false if it doesn't exist
 */
export async function patchRelationshipContext(
  sourceEntityId: string,
  targetEntityId: string,
  relationshipType: string,
  patch: Record<string, unknown>
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('patch_relationship_context', {
    p_source_entity_id: sourceEntityId,
    p_target_entity_id: targetEntityId,
    p_relationship_type: relationshipType,
    p_patch: patch,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (!data) {
    return { success: false, error: 'Edge not found — no relationship was updated' };
  }

  return { success: true };
}

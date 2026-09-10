'use server';

/**
 * Skills for one person.
 *
 * These read `ops.crew_skills`, keyed by the person's `directory.entities` id.
 * They used to read `public.talent_skills` by a legacy `org_member_id` carried
 * in the ROSTER_MEMBER edge's context_data -- a table that does not exist, so
 * the query 404'd, the `if (error) return []` swallowed it, and every roster
 * badge and skill list in the product has been empty since. RLS on
 * `ops.crew_skills` scopes rows to the caller's workspaces, so the entity id is
 * enough to ask with.
 *
 * @module entities/talent/api/get-talent-skills
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { CrewSkillDTO } from '../model/types';

/** Every skill on record for this person, for badges and the expanded card. */
export async function getTalentSkillsByEntityId(
  entityId: string
): Promise<CrewSkillDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('id, skill_tag, proficiency, hourly_rate, verified')
    .eq('entity_id', entityId)
    .order('skill_tag');

  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id,
    skill_tag: r.skill_tag,
    proficiency: r.proficiency,
    hourly_rate: r.hourly_rate,
    verified: r.verified,
  }));
}

/** Skill tags only, for roster badges. */
export async function getSkillTagsByEntityId(entityId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('skill_tag')
    .eq('entity_id', entityId)
    .order('skill_tag');

  if (error) return [];
  return (data ?? []).map((r) => r.skill_tag);
}

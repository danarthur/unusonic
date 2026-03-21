'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { TalentSkillDTO } from '../model/types';

/**
 * Fetch all talent_skills for an org_member (for badges / expanded card).
 */
export async function getTalentSkillsByOrgMemberId(
  orgMemberId: string
): Promise<TalentSkillDTO[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('talent_skills')
    .select('id, skill_tag, proficiency, hourly_rate, verified')
    .eq('org_member_id', orgMemberId)
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

/**
 * Fetch skill tags only (for roster badges). Returns array of skill_tag strings.
 */
export async function getSkillTagsByOrgMemberId(
  orgMemberId: string
): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('talent_skills')
    .select('skill_tag')
    .eq('org_member_id', orgMemberId)
    .order('skill_tag');

  if (error) return [];
  return (data ?? []).map((r) => r.skill_tag);
}

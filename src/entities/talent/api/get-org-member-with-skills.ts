'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { OrgMemberWithSkillsDTO } from '../model/types';
import { getTalentSkillsByOrgMemberId } from './get-talent-skills';

/**
 * Fetch a single org_member by id with their talent_skills (for expanded card).
 */
export async function getOrgMemberWithSkills(
  orgMemberId: string
): Promise<OrgMemberWithSkillsDTO | null> {
  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from('org_members')
    .select('id, profile_id, entity_id, org_id, first_name, last_name, phone, job_title, employment_status, role, default_hourly_rate')
    .eq('id', orgMemberId)
    .single();

  if (error || !member) return null;

  let profile: { full_name: string | null; email: string | null } | null = null;
  let entityEmail: string | null = null;
  if (member.profile_id) {
    const { data: p } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', member.profile_id)
      .maybeSingle();
    profile = p ?? null;
  } else if (member.entity_id) {
    const { data: ent } = await supabase
      .from('entities')
      .select('email')
      .eq('id', member.entity_id)
      .maybeSingle();
    if (ent?.email) {
      entityEmail = ent.email;
    } else {
      // Fallback: directory.entities (email stored in attributes for ghost people)
      const { data: dirEnt } = await supabase
        .schema('directory')
        .from('entities')
        .select('attributes')
        .eq('legacy_entity_id', member.entity_id)
        .maybeSingle();
      const attrs = (dirEnt?.attributes as Record<string, unknown>) ?? {};
      entityEmail = (attrs.email as string | null) ?? null;
    }
  }

  const skills = await getTalentSkillsByOrgMemberId(member.id);
  return {
    id: member.id,
    profile_id: member.profile_id ?? null,
    org_id: member.org_id,
    first_name: member.first_name ?? null,
    last_name: member.last_name ?? null,
    phone: member.phone ?? null,
    job_title: member.job_title ?? null,
    employment_status: member.employment_status,
    role: member.role,
    default_hourly_rate: member.default_hourly_rate,
    skills,
    profiles: profile ?? (entityEmail ? { full_name: null, email: entityEmail } : null),
  };
}

/**
 * Resolve org_member by profile_id + org_id (for current user or a given profile in an org).
 */
export async function getOrgMemberByProfileAndOrg(
  profileId: string,
  orgId: string
): Promise<OrgMemberWithSkillsDTO | null> {
  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from('org_members')
    .select('id, profile_id, entity_id, org_id, first_name, last_name, phone, job_title, employment_status, role, default_hourly_rate')
    .eq('profile_id', profileId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error || !member) return null;

  let profile: { full_name: string | null; email: string | null } | null = null;
  let entityEmail: string | null = null;
  if (member.profile_id) {
    const { data: p } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', member.profile_id)
      .maybeSingle();
    profile = p ?? null;
  } else if (member.entity_id) {
    const { data: ent } = await supabase
      .from('entities')
      .select('email')
      .eq('id', member.entity_id)
      .maybeSingle();
    if (ent?.email) {
      entityEmail = ent.email;
    } else {
      // Fallback: directory.entities (email stored in attributes for ghost people)
      const { data: dirEnt } = await supabase
        .schema('directory')
        .from('entities')
        .select('attributes')
        .eq('legacy_entity_id', member.entity_id)
        .maybeSingle();
      const attrs = (dirEnt?.attributes as Record<string, unknown>) ?? {};
      entityEmail = (attrs.email as string | null) ?? null;
    }
  }

  const skills = await getTalentSkillsByOrgMemberId(member.id);
  return {
    id: member.id,
    profile_id: member.profile_id ?? null,
    org_id: member.org_id,
    first_name: member.first_name ?? null,
    last_name: member.last_name ?? null,
    phone: member.phone ?? null,
    job_title: member.job_title ?? null,
    employment_status: member.employment_status,
    role: member.role,
    default_hourly_rate: member.default_hourly_rate,
    skills,
    profiles: profile ?? (entityEmail ? { full_name: null, email: entityEmail } : null),
  };
}

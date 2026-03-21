'use server';
/* eslint-disable no-restricted-syntax -- TODO: migrate entity attrs reads to readEntityAttrs() from @/shared/lib/entity-attrs */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import type { OrgMemberWithSkillsDTO, EmploymentStatus, OrgMemberRole } from '../model/types';
import { getTalentSkillsByOrgMemberId } from './get-talent-skills';

/**
 * Fetch a single roster member by cortex.relationships.id with their talent_skills.
 * Session 9: reads from cortex.relationships + directory.entities.
 * Falls back to public.org_members for callers passing legacy org_member_ids.
 */
export async function getOrgMemberWithSkills(
  orgMemberId: string
): Promise<OrgMemberWithSkillsDTO | null> {
  const supabase = await createClient();

  // --- Cortex path (primary) ---
  const { data: rel } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, target_entity_id, context_data')
    .eq('id', orgMemberId)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  if (rel) {
    const ctx = (rel.context_data as Record<string, unknown>) ?? {};

    const [personEnt, targetOrgEnt] = await Promise.all([
      supabase.schema('directory').from('entities')
        .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
        .eq('id', rel.source_entity_id).maybeSingle(),
      supabase.schema('directory').from('entities')
        .select('legacy_org_id').eq('id', rel.target_entity_id).maybeSingle(),
    ]);

    const attrs = (personEnt.data?.attributes as Record<string, unknown>) ?? {};
    const email = (attrs.email as string | null) ?? null;

    // Skills via legacy org_member_id stored in context_data (crosswalk)
    const legacyOrgMemberId = (ctx.org_member_id as string | null) ?? null;
    const skills = legacyOrgMemberId ? await getTalentSkillsByOrgMemberId(legacyOrgMemberId) : [];

    const orgId = targetOrgEnt.data?.legacy_org_id ?? rel.target_entity_id;

    return {
      id: rel.id,
      profile_id: personEnt.data?.claimed_by_user_id ?? null,
      org_id: orgId,
      first_name: (ctx.first_name as string | null) ?? null,
      last_name: (ctx.last_name as string | null) ?? null,
      phone: (attrs.phone as string | null) ?? null,
      job_title: (ctx.job_title as string | null) ?? null,
      employment_status: ((ctx.employment_status as string) ?? 'internal_employee') as EmploymentStatus,
      role: ((ctx.role as string) ?? 'member') as OrgMemberRole,
      default_hourly_rate: (ctx.default_hourly_rate as number | null) ?? 0,
      skills,
      profiles: email ? { full_name: personEnt.data?.display_name ?? null, email } : null,
    };
  }

  return null;
}

/**
 * Resolve org member by profile_id (user_id) + org_id for current user or a given profile in an org.
 * Session 9: reads from directory.entities + cortex.relationships.
 */
export async function getOrgMemberByProfileAndOrg(
  profileId: string,
  orgId: string
): Promise<OrgMemberWithSkillsDTO | null> {
  const supabase = await createClient();

  // --- Cortex path (primary): profileId is a user_id (claimed_by_user_id) ---
  const [personRes, orgEntRes] = await Promise.all([
    supabase.schema('directory').from('entities')
      .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
      .eq('claimed_by_user_id', profileId).maybeSingle(),
    supabase.schema('directory').from('entities')
      .select('id').eq('legacy_org_id', orgId).maybeSingle(),
  ]);

  if (personRes.data && orgEntRes.data) {
    const { data: rel } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('id, source_entity_id, target_entity_id, context_data')
      .eq('source_entity_id', personRes.data.id)
      .eq('target_entity_id', orgEntRes.data.id)
      .eq('relationship_type', 'ROSTER_MEMBER')
      .maybeSingle();

    if (rel) {
      const ctx = (rel.context_data as Record<string, unknown>) ?? {};
      const attrs = (personRes.data.attributes as Record<string, unknown>) ?? {};
      const email = (attrs.email as string | null) ?? null;

      const legacyOrgMemberId = (ctx.org_member_id as string | null) ?? null;
      const skills = legacyOrgMemberId ? await getTalentSkillsByOrgMemberId(legacyOrgMemberId) : [];

      return {
        id: rel.id,
        profile_id: personRes.data.claimed_by_user_id ?? null,
        org_id: orgId,
        first_name: (ctx.first_name as string | null) ?? null,
        last_name: (ctx.last_name as string | null) ?? null,
        phone: (attrs.phone as string | null) ?? null,
        job_title: (ctx.job_title as string | null) ?? null,
        employment_status: ((ctx.employment_status as string) ?? 'internal_employee') as EmploymentStatus,
        role: ((ctx.role as string) ?? 'member') as OrgMemberRole,
        default_hourly_rate: (ctx.default_hourly_rate as number | null) ?? 0,
        skills,
        profiles: email ? { full_name: personRes.data.display_name ?? null, email } : null,
      };
    }
  }

  return null;
}

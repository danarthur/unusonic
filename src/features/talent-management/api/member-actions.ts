'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getOrgMemberWithSkills } from '@/entities/talent';
import type { OrgMemberWithSkillsDTO } from '@/entities/talent';
import { updateMemberIdentitySchema, addSkillSchema, removeSkillSchema } from '../model/schema';
import type { UpdateMemberIdentityInput, AddSkillInput, RemoveSkillInput } from '../model/schema';

export async function getMemberForSheet(orgMemberId: string): Promise<OrgMemberWithSkillsDTO | null> {
  return getOrgMemberWithSkills(orgMemberId);
}

export type MemberActionResult = { ok: true } | { ok: false; error: string };

async function assertCanManageOrgMember(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not signed in.' };
  const { data: entity } = await supabase.from('entities').select('id').eq('auth_id', user.id).maybeSingle();
  if (!entity) return { ok: false as const, error: 'Account not linked.' };
  const { data: aff } = await supabase
    .from('affiliations')
    .select('organization_id')
    .eq('entity_id', entity.id)
    .eq('organization_id', orgId)
    .in('access_level', ['admin', 'member'])
    .eq('status', 'active')
    .maybeSingle();
  if (!aff) return { ok: false as const, error: 'No permission to manage this org.' };
  return null;
}

type OrgMemberRoleDb = 'owner' | 'admin' | 'member' | 'restricted';

export async function updateMemberIdentity(input: UpdateMemberIdentityInput): Promise<MemberActionResult> {
  const parsed = updateMemberIdentitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const supabase = await createClient();
  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('id', parsed.data.org_member_id)
    .single();
  if (!member) return { ok: false, error: 'Member not found.' };
  const err = await assertCanManageOrgMember(supabase, member.org_id);
  if (err) return err;

  const updatePayload: {
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    job_title: string | null;
    role?: OrgMemberRoleDb;
  } = {
    first_name: parsed.data.first_name ?? null,
    last_name: parsed.data.last_name ?? null,
    phone: parsed.data.phone ?? null,
    job_title: parsed.data.job_title ?? null,
  };

  if (parsed.data.role !== undefined) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not signed in.' };
    const { data: currentEntity } = await supabase
      .from('entities')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle();
    if (currentEntity) {
      const { data: currentMember } = await supabase
        .from('org_members')
        .select('role')
        .eq('org_id', member.org_id)
        .eq('entity_id', currentEntity.id)
        .maybeSingle();
      const currentRole = (currentMember?.role as OrgMemberRoleDb | null) ?? null;
      const newRole = parsed.data.role === 'manager' ? 'member' : parsed.data.role;
      const dbRole = newRole as OrgMemberRoleDb;
      if (newRole === 'owner' && currentRole !== 'owner') {
        return { ok: false, error: 'Only the owner can assign the owner role.' };
      }
      if (['admin', 'member'].includes(newRole) && currentRole !== 'owner' && currentRole !== 'admin') {
        return { ok: false, error: 'Only owners and admins can change roles.' };
      }
      updatePayload.role = dbRole;
    }
  }

  const { error } = await supabase
    .from('org_members')
    .update(updatePayload)
    .eq('id', parsed.data.org_member_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function addSkillToMember(input: AddSkillInput): Promise<MemberActionResult> {
  const parsed = addSkillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const supabase = await createClient();
  const { data: om } = await supabase
    .from('org_members')
    .select('id, org_id, workspace_id')
    .eq('id', parsed.data.org_member_id)
    .single();
  if (!om) return { ok: false, error: 'Member not found.' };
  const err = await assertCanManageOrgMember(supabase, om.org_id);
  if (err) return err;

  const { error } = await supabase.from('talent_skills').insert({
    org_member_id: parsed.data.org_member_id,
    workspace_id: om.workspace_id,
    skill_tag: parsed.data.skill_tag.trim(),
  });

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Skill already added.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function removeSkillFromMember(input: RemoveSkillInput): Promise<MemberActionResult> {
  const parsed = removeSkillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const supabase = await createClient();
  const { data: skill } = await supabase
    .from('talent_skills')
    .select('org_member_id')
    .eq('id', parsed.data.talent_skill_id)
    .single();
  if (!skill) return { ok: false, error: 'Skill not found.' };
  const { data: om } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('id', skill.org_member_id)
    .single();
  if (!om) return { ok: false, error: 'Member not found.' };
  const err = await assertCanManageOrgMember(supabase, om.org_id);
  if (err) return err;

  const { error } = await supabase
    .from('talent_skills')
    .delete()
    .eq('id', parsed.data.talent_skill_id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Resolve an org member (roster person) to a workspace member so we can show/edit workspace role.
 * Used by MemberDetailSheet: if this person is in the workspace, show WorkspaceRoleSelect.
 */
export async function getWorkspaceMemberByOrgMemberId(
  orgMemberId: string,
  workspaceId: string
): Promise<{ workspaceMemberId: string; roleId: string | null } | null> {
  const supabase = await createClient();
  const { data: orgMember } = await supabase
    .from('org_members')
    .select('profile_id, entity_id')
    .eq('id', orgMemberId)
    .single();
  if (!orgMember) return null;

  let userId: string | null = orgMember.profile_id ?? null;
  if (!userId && orgMember.entity_id) {
    const [publicEnt, dirEnt] = await Promise.all([
      supabase.from('entities').select('auth_id').eq('id', orgMember.entity_id).maybeSingle(),
      supabase.schema('directory').from('entities').select('claimed_by_user_id').eq('id', orgMember.entity_id).maybeSingle(),
    ]);
    userId = publicEnt.data?.auth_id ?? dirEnt.data?.claimed_by_user_id ?? null;
  }
  if (!userId) return null;

  const { data: wm } = await supabase
    .from('workspace_members')
    .select('id, role_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!wm) return null;

  return { workspaceMemberId: wm.id, roleId: wm.role_id ?? null };
}

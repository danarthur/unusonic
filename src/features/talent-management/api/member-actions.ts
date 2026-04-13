'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getOrgMemberWithSkills } from '@/entities/talent';
import type { OrgMemberWithSkillsDTO } from '@/entities/talent';
import { updateMemberIdentitySchema, addSkillSchema, removeSkillSchema } from '../model/schema';
import type { UpdateMemberIdentityInput, AddSkillInput, RemoveSkillInput } from '../model/schema';
import { addCrewSkill, removeCrewSkill } from './crew-skill-actions';

export async function getMemberForSheet(orgMemberId: string): Promise<OrgMemberWithSkillsDTO | null> {
  return getOrgMemberWithSkills(orgMemberId);
}

export type MemberActionResult = { ok: true } | { ok: false; error: string };

/**
 * Assert caller belongs to org via directory.entities + cortex.relationships.
 * Session 9: migrated from public.entities + public.affiliations.
 * orgId may be a legacy_org_id UUID or directory entity id.
 */
async function assertCanManageOrgMember(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'Not signed in.' };

  const { data: personEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
  if (!personEnt) return { ok: false as const, error: 'Account not linked.' };

  // Resolve org entity (legacy_org_id first, then direct id)
  let orgEntId: string | null = null;
  const { data: orgByLegacy } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('legacy_org_id', orgId).maybeSingle();
  if (orgByLegacy) {
    orgEntId = orgByLegacy.id;
  } else {
    const { data: orgById } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('id', orgId).maybeSingle();
    orgEntId = orgById?.id ?? null;
  }
  if (!orgEntId) return { ok: false as const, error: 'Organization not found.' };

  const { data: rel } = await supabase
    .schema('cortex').from('relationships')
    .select('id').eq('source_entity_id', personEnt.id).eq('target_entity_id', orgEntId)
    .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER']).maybeSingle();

  if (!rel) return { ok: false as const, error: 'No permission to manage this org.' };
  return null;
}

type OrgMemberRoleDb = 'owner' | 'admin' | 'member' | 'restricted';

/**
 * Update roster member identity (name, phone, job_title, role).
 * Session 9: reads from cortex.relationships, updates context_data + directory.entities.
 * org_member_id is now a cortex.relationships.id.
 */
export async function updateMemberIdentity(input: UpdateMemberIdentityInput): Promise<MemberActionResult> {
  const parsed = updateMemberIdentitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const supabase = await createClient();

  // Resolve cortex relationship (org_member_id is now cortex rel id)
  const { data: rel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, context_data, relationship_type')
    .eq('id', parsed.data.org_member_id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  if (!rel) return { ok: false, error: 'Member not found.' };

  // Get org_id (legacy_org_id) for permission check
  const { data: targetOrg } = await supabase
    .schema('directory').from('entities')
    .select('legacy_org_id').eq('id', rel.target_entity_id).maybeSingle();
  const orgId = targetOrg?.legacy_org_id ?? rel.target_entity_id;

  const err = await assertCanManageOrgMember(supabase, orgId);
  if (err) return err;

  const existingCtx = (rel.context_data as Record<string, unknown>) ?? {};

  // Build updated context_data patch
  const ctxPatch: Record<string, unknown> = { ...existingCtx };
  if (parsed.data.first_name !== undefined) ctxPatch.first_name = parsed.data.first_name ?? null;
  if (parsed.data.last_name !== undefined) ctxPatch.last_name = parsed.data.last_name ?? null;
  if (parsed.data.job_title !== undefined) ctxPatch.job_title = parsed.data.job_title ?? null;

  if (parsed.data.role !== undefined) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not signed in.' };

    const { data: callerEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
    if (callerEnt) {
      const { data: callerRel } = await supabase
        .schema('cortex').from('relationships')
        .select('context_data')
        .eq('source_entity_id', callerEnt.id)
        .eq('target_entity_id', rel.target_entity_id)
        .eq('relationship_type', 'ROSTER_MEMBER')
        .maybeSingle();
      const callerCtx = (callerRel?.context_data as Record<string, unknown>) ?? {};
      const currentRole = (callerCtx.role as OrgMemberRoleDb | null) ?? null;
      const newRole = parsed.data.role === 'manager' ? 'member' : parsed.data.role;
      if (newRole === 'owner' && currentRole !== 'owner') {
        return { ok: false, error: 'Only the owner can assign the owner role.' };
      }
      if (['admin', 'member'].includes(newRole) && currentRole !== 'owner' && currentRole !== 'admin') {
        return { ok: false, error: 'Only owners and admins can change roles.' };
      }
      ctxPatch.role = newRole as OrgMemberRoleDb;
    }
  }

  // Update cortex context_data via upsert_relationship
  const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: rel.source_entity_id,
    p_target_entity_id: rel.target_entity_id,
    p_type: rel.relationship_type,
    p_context_data: ctxPatch,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message };

  // Update phone on directory.entities.attributes via patch_entity_attributes RPC
  // (raw attribute spread is prohibited in this ESLint scope — use the SECURITY DEFINER RPC)
  if (parsed.data.phone !== undefined) {
    await supabase.rpc('patch_entity_attributes', {
      p_entity_id: rel.source_entity_id,
      p_attributes: { phone: parsed.data.phone ?? null },
    });
  }

  return { ok: true };
}

export async function addSkillToMember(input: AddSkillInput): Promise<MemberActionResult> {
  const parsed = addSkillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }
  const supabase = await createClient();

  // org_member_id is a cortex.relationships.id (ROSTER_MEMBER edge)
  // source_entity_id is the directory.entities.id for the person
  const { data: rel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id')
    .eq('id', parsed.data.org_member_id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();
  if (!rel) return { ok: false, error: 'Member not found.' };

  // Permission check — verify caller manages this org
  const { data: orgEnt } = await supabase
    .schema('directory').from('entities')
    .select('legacy_org_id').eq('id', rel.target_entity_id).maybeSingle();
  const orgId = orgEnt?.legacy_org_id ?? rel.target_entity_id;
  const err = await assertCanManageOrgMember(supabase, orgId);
  if (err) return err;

  // Delegate to ops.crew_skills via crew-skill-actions
  // public.talent_skills is deprecated — do not write here. Use ops.crew_skills via crew-skill-actions.ts
  const result = await addCrewSkill({
    entity_id: rel.source_entity_id,
    skill_tag: parsed.data.skill_tag,
  });

  return result.ok ? { ok: true } : result;
}

export async function removeSkillFromMember(input: RemoveSkillInput): Promise<MemberActionResult> {
  const parsed = removeSkillSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  // Delegate to ops.crew_skills via crew-skill-actions.
  // talent_skill_id is now treated as crew_skill_id (ops.crew_skills.id).
  // public.talent_skills is deprecated — do not write here. Use ops.crew_skills via crew-skill-actions.ts
  const result = await removeCrewSkill({ crew_skill_id: parsed.data.talent_skill_id });
  return result;
}

/**
 * Resolve an org member (roster person) to a workspace member for role display.
 * Session 9: reads from cortex.relationships + directory.entities for user_id lookup.
 */
export async function getWorkspaceMemberByOrgMemberId(
  orgMemberId: string,
  workspaceId: string
): Promise<{ workspaceMemberId: string; roleId: string | null } | null> {
  const supabase = await createClient();

  // orgMemberId is cortex.relationships.id
  const { data: rel } = await supabase
    .schema('cortex').from('relationships')
    .select('source_entity_id')
    .eq('id', orgMemberId)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  let userId: string | null = null;

  if (rel) {
    const { data: personEnt } = await supabase
      .schema('directory').from('entities')
      .select('claimed_by_user_id').eq('id', rel.source_entity_id).maybeSingle();
    userId = personEnt?.claimed_by_user_id ?? null;
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

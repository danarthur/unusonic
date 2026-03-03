'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentEntityId } from '@/features/network/api/actions';
import { inviteTalentSchema } from '../model/schema';
import type { InviteTalentInput } from '../model/schema';

export type InviteTalentResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/** Check if a profile exists for this email (for "User Found" vs "Creating New Profile" UI). */
export async function checkEmailExists(email: string): Promise<boolean> {
  if (!email?.trim()) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email.trim())
    .maybeSingle();
  return !!data;
}

/**
 * Create Talent (Prism Injector): Link existing user OR create Ghost Member.
 * Path 1 (User exists): Entity + Affiliation + OrgMember (profile_id + entity_id) + Skills.
 * Path 2 (Ghost): Entity (is_ghost) + Affiliation + OrgMember (entity_id only) + Skills.
 */
export async function inviteTalent(
  orgId: string,
  input: InviteTalentInput
): Promise<InviteTalentResult> {
  const parsed = inviteTalentSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Invalid input.' };
  }

  const { email, first_name, last_name, phone, job_title, employment_status, role, skill_tags } =
    parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: 'You must be signed in to add talent.' };
  }

  const myEntityId = await getCurrentEntityId();
  if (!myEntityId) {
    return { ok: false, error: 'Your account is not linked to an organization.' };
  }

  const { data: aff } = await supabase
    .from('affiliations')
    .select('organization_id')
    .eq('entity_id', myEntityId)
    .eq('organization_id', orgId)
    .in('access_level', ['admin', 'member'])
    .eq('status', 'active')
    .maybeSingle();
  if (!aff) {
    return { ok: false, error: 'You do not have permission to add members to this organization.' };
  }

  const emailTrim = email.trim();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', emailTrim)
    .maybeSingle();

  let inviteeEntityId: string;

  if (profile) {
    // ——— Path 1: User exists (claimed or will be) ———
    const profileId = profile.id;
    const profileEmail = profile.email ?? emailTrim;

    const { data: existingByProfile } = await supabase
      .from('org_members')
      .select('id')
      .eq('profile_id', profileId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (existingByProfile) {
      return { ok: false, error: 'This person is already a member of this organization.' };
    }

    let { data: inviteeEntity } = await supabase
      .from('entities')
      .select('id')
      .eq('auth_id', profileId)
      .maybeSingle();

    if (!inviteeEntity) {
      const { data: newEntity, error: entityError } = await supabase
        .from('entities')
        .insert({
          email: profileEmail,
          is_ghost: false,
          auth_id: profileId,
        })
        .select('id')
        .single();
      if (entityError || !newEntity) {
        return {
          ok: false,
          error: entityError?.message ?? 'Failed to create profile record.',
        };
      }
      inviteeEntity = newEntity;
    }
    inviteeEntityId = inviteeEntity.id;

    const { data: existingAff } = await supabase
      .from('affiliations')
      .select('id')
      .eq('entity_id', inviteeEntityId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (!existingAff) {
      const affAccessLevel = role === 'admin' ? 'admin' : 'member';
      const { error: affError } = await supabase.from('affiliations').insert({
        entity_id: inviteeEntityId,
        organization_id: orgId,
        access_level: affAccessLevel,
        role_label: job_title?.trim() || null,
        status: 'active',
      });
      if (affError) {
        return {
          ok: false,
          error: affError?.message ?? 'Failed to link profile to organization.',
        };
      }
    }

    const { data: orgMember, error: memberError } = await supabase
      .from('org_members')
      .insert({
        profile_id: profileId,
        entity_id: inviteeEntityId,
        org_id: orgId,
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        phone: phone ?? null,
        job_title: job_title ?? null,
        employment_status,
        role,
        default_hourly_rate: 0,
      })
      .select('id')
      .single();

    if (memberError || !orgMember) {
      return {
        ok: false,
        error: memberError?.message ?? 'Failed to add member to organization.',
      };
    }

    if (skill_tags.length > 0) {
      const skillRows = skill_tags.map((skill_tag) => ({
        org_member_id: orgMember.id,
        skill_tag: skill_tag.trim(),
      }));
      const { error: skillsError } = await supabase.from('talent_skills').insert(skillRows);
      if (skillsError) {
        await supabase.from('org_members').delete().eq('id', orgMember.id);
        return {
          ok: false,
          error: skillsError?.message ?? 'Failed to add skills; member was not added.',
        };
      }
    }

    // Non-fatal cortex ROSTER_MEMBER edge mirror (errors silently ignored)
    const [personDir, orgDir] = await Promise.all([
      supabase.schema('directory').from('entities').select('id').eq('legacy_entity_id', inviteeEntityId).maybeSingle(),
      supabase.schema('directory').from('entities').select('id').eq('legacy_org_id', orgId).maybeSingle(),
    ]);
    if (personDir.data?.id && orgDir.data?.id) {
      await supabase.rpc('upsert_relationship', {
        p_source_entity_id: personDir.data.id,
        p_target_entity_id: orgDir.data.id,
        p_type: 'ROSTER_MEMBER',
        p_context_data: { first_name: first_name ?? null, last_name: last_name ?? null, role, job_title: job_title ?? null, employment_status, org_member_id: orgMember.id },
      });
    }

    const statusLabel =
      employment_status === 'external_contractor' ? 'Contractor' : 'Employee';
    const skillsLabel =
      skill_tags.length > 0
        ? ` with ${skill_tags.length} skill${skill_tags.length === 1 ? '' : 's'}`
        : '';
    return {
      ok: true,
      message: `${emailTrim} added as ${statusLabel}${skillsLabel}.`,
    };
  }

  // ——— Path 2: Ghost (Day One) ———
  const { data: existingGhostEntity } = await supabase
    .from('entities')
    .select('id')
    .eq('email', emailTrim)
    .eq('is_ghost', true)
    .maybeSingle();

  if (existingGhostEntity) {
    const { data: existingGhostMember } = await supabase
      .from('org_members')
      .select('id')
      .eq('entity_id', existingGhostEntity.id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (existingGhostMember) {
      return { ok: false, error: 'This person is already in this organization.' };
    }
    inviteeEntityId = existingGhostEntity.id;
  } else {
    const { data: newGhost, error: ghostEntityError } = await supabase
      .from('entities')
      .insert({
        email: emailTrim,
        is_ghost: true,
        auth_id: null,
      })
      .select('id')
      .single();
    if (ghostEntityError || !newGhost) {
      return {
        ok: false,
        error: ghostEntityError?.message ?? 'Failed to create profile.',
      };
    }
    inviteeEntityId = newGhost.id;
  }

  const { data: existingAff } = await supabase
    .from('affiliations')
    .select('id')
    .eq('entity_id', inviteeEntityId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (!existingAff) {
    const { error: affError } = await supabase.from('affiliations').insert({
      entity_id: inviteeEntityId,
      organization_id: orgId,
      access_level: role === 'admin' ? 'admin' : 'member',
      role_label: job_title?.trim() || null,
      status: 'active',
    });
    if (affError) {
      if (!existingGhostEntity) {
        await supabase.from('entities').delete().eq('id', inviteeEntityId);
      }
      return {
        ok: false,
        error: affError?.message ?? 'Failed to link profile to organization.',
      };
    }
  }

  const { data: orgMember, error: memberError } = await supabase
    .from('org_members')
    .insert({
      entity_id: inviteeEntityId,
      profile_id: null,
      org_id: orgId,
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      phone: phone ?? null,
      job_title: job_title ?? null,
      employment_status,
      role,
      default_hourly_rate: 0,
    })
    .select('id')
    .single();

  if (memberError || !orgMember) {
    await supabase.from('affiliations').delete().eq('entity_id', inviteeEntityId).eq('organization_id', orgId);
    if (!existingGhostEntity) {
      await supabase.from('entities').delete().eq('id', inviteeEntityId);
    }
    return {
      ok: false,
      error: memberError?.message ?? 'Failed to add member to organization.',
    };
  }

  if (skill_tags.length > 0) {
    const skillRows = skill_tags.map((skill_tag) => ({
      org_member_id: orgMember.id,
      skill_tag: skill_tag.trim(),
    }));
    const { error: skillsError } = await supabase.from('talent_skills').insert(skillRows);
    if (skillsError) {
      await supabase.from('org_members').delete().eq('id', orgMember.id);
      await supabase.from('affiliations').delete().eq('entity_id', inviteeEntityId).eq('organization_id', orgId);
      if (!existingGhostEntity) {
        await supabase.from('entities').delete().eq('id', inviteeEntityId);
      }
      return {
        ok: false,
        error: skillsError?.message ?? 'Failed to add skills; member was not added.',
      };
    }
  }

  // Non-fatal: sync ghost person to directory.entities + create cortex ROSTER_MEMBER edge
  const { data: orgDirGhost } = await supabase
    .schema('directory').from('entities').select('id, owner_workspace_id').eq('legacy_org_id', orgId).maybeSingle();
  if (orgDirGhost?.id) {
    let dirGhostPersonId: string | null = null;
    const { data: existingDirGhost } = await supabase
      .schema('directory').from('entities').select('id').eq('legacy_entity_id', inviteeEntityId).maybeSingle();
    if (existingDirGhost?.id) {
      dirGhostPersonId = existingDirGhost.id;
    } else if (!existingGhostEntity) {
      // Only mirror for newly created ghost entities (avoid overwriting existing directory records)
      const { data: newDirGhost } = await supabase
        .schema('directory').from('entities')
        .insert({ legacy_entity_id: inviteeEntityId, display_name: [first_name, last_name].filter(Boolean).join(' ').trim() || emailTrim, type: 'person', owner_workspace_id: orgDirGhost.owner_workspace_id ?? null, claimed_by_user_id: null, attributes: { is_ghost: true, email: emailTrim } })
        .select('id').maybeSingle();
      dirGhostPersonId = newDirGhost?.id ?? null;
    }
    if (dirGhostPersonId) {
      await supabase.rpc('upsert_relationship', {
        p_source_entity_id: dirGhostPersonId,
        p_target_entity_id: orgDirGhost.id,
        p_type: 'ROSTER_MEMBER',
        p_context_data: { first_name: first_name ?? null, last_name: last_name ?? null, role, job_title: job_title ?? null, employment_status, org_member_id: orgMember.id },
      });
    }
  }

  const statusLabel =
    employment_status === 'external_contractor' ? 'Contractor' : 'Employee';
  const skillsLabel =
    skill_tags.length > 0
      ? ` with ${skill_tags.length} skill${skill_tags.length === 1 ? '' : 's'}`
      : '';
  return {
    ok: true,
    message: `${first_name ?? ''} ${last_name ?? ''} (Ghost) added as ${statusLabel}${skillsLabel}.`.trim() || `${emailTrim} added as ${statusLabel}${skillsLabel}.`,
  };
}

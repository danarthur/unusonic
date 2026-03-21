'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
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
 * Session 10: directory.entities + cortex.relationships only. No legacy writes.
 *
 * Path 1 (User exists): directory person entity + ROSTER_MEMBER edge + Skills.
 * Path 2 (Ghost): ghost directory person entity + ROSTER_MEMBER edge + Skills.
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

  // Membership check via directory.entities + cortex.relationships
  const { data: myDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
  if (!myDirEnt) {
    return { ok: false, error: 'Your account is not linked to an organization.' };
  }

  const { data: orgDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id, owner_workspace_id').eq('legacy_org_id', orgId).maybeSingle();
  if (!orgDirEnt) {
    return { ok: false, error: 'Organization not found.' };
  }

  const { data: membershipRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id').eq('source_entity_id', myDirEnt.id).eq('target_entity_id', orgDirEnt.id)
    .in('relationship_type', ['MEMBER', 'ROSTER_MEMBER']).maybeSingle();

  if (!membershipRel) {
    return { ok: false, error: 'You do not have permission to add members to this organization.' };
  }

  const emailTrim = email.trim();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('email', emailTrim)
    .maybeSingle();

  if (profile) {
    // ——— Path 1: User exists (claimed or will be) ———
    const profileId = profile.id;
    const profileEmail = profile.email ?? emailTrim;

    // Find or create directory person entity
    let { data: inviteeDirEnt } = await supabase
      .schema('directory').from('entities')
      .select('id').eq('claimed_by_user_id', profileId).maybeSingle();

    if (!inviteeDirEnt) {
      const { data: newDirEnt, error: newEntErr } = await supabase
        .schema('directory').from('entities')
        .insert({
          display_name: [first_name, last_name].filter(Boolean).join(' ').trim() || profileEmail,
          type: 'person',
          claimed_by_user_id: profileId,
          owner_workspace_id: orgDirEnt.owner_workspace_id ?? null,
          attributes: { email: profileEmail, is_ghost: false, first_name: first_name ?? null, last_name: last_name ?? null },
        })
        .select('id')
        .single();
      if (newEntErr || !newDirEnt) {
        return { ok: false, error: newEntErr?.message ?? 'Failed to create profile record.' };
      }
      inviteeDirEnt = newDirEnt;
    }

    // Dup check via cortex
    const { data: existingRel } = await supabase
      .schema('cortex').from('relationships')
      .select('id').eq('source_entity_id', inviteeDirEnt.id).eq('target_entity_id', orgDirEnt.id)
      .eq('relationship_type', 'ROSTER_MEMBER').maybeSingle();
    if (existingRel) {
      return { ok: false, error: 'This person is already a member of this organization.' };
    }

    // Create ROSTER_MEMBER edge
    const { data: newRel, error: relErr } = await supabase.rpc('upsert_relationship', {
      p_source_entity_id: inviteeDirEnt.id,
      p_target_entity_id: orgDirEnt.id,
      p_type: 'ROSTER_MEMBER',
      p_context_data: {
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        role,
        job_title: job_title ?? null,
        employment_status,
        phone: phone ?? null,
      },
    });
    if (relErr || !newRel) {
      return { ok: false, error: relErr?.message ?? 'Failed to add member to organization.' };
    }

    const relId = newRel as string;

    if (skill_tags.length > 0) {
      const skillRows = skill_tags.map((skill_tag) => ({
        org_member_id: relId,
        skill_tag: skill_tag.trim(),
      }));
      const { error: skillsError } = await supabase.from('talent_skills').insert(skillRows);
      if (skillsError) {
        return { ok: false, error: skillsError.message ?? 'Failed to add skills; member was not added.' };
      }
    }

    const statusLabel = employment_status === 'external_contractor' ? 'Contractor' : 'Employee';
    const skillsLabel = skill_tags.length > 0
      ? ` with ${skill_tags.length} skill${skill_tags.length === 1 ? '' : 's'}`
      : '';
    return { ok: true, message: `${emailTrim} added as ${statusLabel}${skillsLabel}.` };
  }

  // ——— Path 2: Ghost (no account yet) ———

  // Find or create ghost person in directory.entities (match by email in attributes)
  let { data: ghostDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').ilike('attributes->>email', emailTrim).eq('type', 'person').is('claimed_by_user_id', null).maybeSingle();

  if (!ghostDirEnt) {
    const { data: newGhostEnt, error: ghostEntErr } = await supabase
      .schema('directory').from('entities')
      .insert({
        display_name: [first_name, last_name].filter(Boolean).join(' ').trim() || emailTrim,
        type: 'person',
        claimed_by_user_id: null,
        owner_workspace_id: orgDirEnt.owner_workspace_id ?? null,
        attributes: { is_ghost: true, email: emailTrim, first_name: first_name ?? null, last_name: last_name ?? null },
      })
      .select('id')
      .single();
    if (ghostEntErr || !newGhostEnt) {
      return { ok: false, error: ghostEntErr?.message ?? 'Failed to create profile.' };
    }
    ghostDirEnt = newGhostEnt;
  }

  // Dup check via cortex
  const { data: existingGhostRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id').eq('source_entity_id', ghostDirEnt.id).eq('target_entity_id', orgDirEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER').maybeSingle();
  if (existingGhostRel) {
    return { ok: false, error: 'This person is already in this organization.' };
  }

  // Create ROSTER_MEMBER edge
  const { data: newGhostRel, error: ghostRelErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: ghostDirEnt.id,
    p_target_entity_id: orgDirEnt.id,
    p_type: 'ROSTER_MEMBER',
    p_context_data: {
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      role,
      job_title: job_title ?? null,
      employment_status,
      phone: phone ?? null,
    },
  });
  if (ghostRelErr || !newGhostRel) {
    return { ok: false, error: ghostRelErr?.message ?? 'Failed to add member to organization.' };
  }

  const ghostRelId = newGhostRel as string;

  if (skill_tags.length > 0) {
    const skillRows = skill_tags.map((skill_tag) => ({
      org_member_id: ghostRelId,
      skill_tag: skill_tag.trim(),
    }));
    const { error: skillsError } = await supabase.from('talent_skills').insert(skillRows);
    if (skillsError) {
      return { ok: false, error: skillsError.message ?? 'Failed to add skills; member was not added.' };
    }
  }

  const statusLabel = employment_status === 'external_contractor' ? 'Contractor' : 'Employee';
  const skillsLabel = skill_tags.length > 0
    ? ` with ${skill_tags.length} skill${skill_tags.length === 1 ? '' : 's'}`
    : '';
  return {
    ok: true,
    message: `${first_name ?? ''} ${last_name ?? ''} (Ghost) added as ${statusLabel}${skillsLabel}.`.trim() || `${emailTrim} added as ${statusLabel}${skillsLabel}.`,
  };
}

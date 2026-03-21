'use server';

import 'server-only';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentOrgId, getCurrentEntityId } from '@/features/network/api/actions';
import { getOrgDetails } from '@/features/org-management/api';
import { listOrgMembers } from '@/entities/organization/api/list-org-members';
import { upsertGhostMemberSchema, type UpsertGhostMemberInput } from '../model/schema';
import type { RosterBadgeData, RosterBadgeStatus, RosterMemberDisplay } from '../model/types';

export type InviteEmployeeResult = { ok: true; message: string } | { ok: false; error: string };
export type UpsertGhostResult = { ok: true; member: RosterBadgeData } | { ok: false; error: string };
export type DeployInvitesResult = { ok: true; sent: number } | { ok: false; error: string };

/** Phase 1: owner, admin, manager, member, restricted (Observer). */
export type OrgMemberRole = 'owner' | 'admin' | 'manager' | 'member' | 'restricted';

/** Map DB/Supabase errors to Signal-friendly messages (no raw RLS or constraint text). */
function normalizeRosterError(err: { message?: string; code?: string } | null | undefined): string {
  if (!err?.message) return 'Something went wrong. Please try again.';
  const msg = err.message.toLowerCase();
  const code = String(err.code ?? '');
  if (process.env.NODE_ENV === 'development') {
    console.error('[team-invite] Supabase error:', { code, message: err.message });
  }
  if (code === '42501' || msg.includes('row-level security') || msg.includes('row level security') || msg.includes('violates row-level')) {
    return "You don't have permission to do that. If you just joined this team, try refreshing the page.";
  }
  if (code === '23505' || msg.includes('unique constraint') || msg.includes('duplicate key')) {
    return 'This email is already in use. Use a different address or add them from your network.';
  }
  if (code === '23503' || msg.includes('foreign key') || msg.includes('violates foreign key')) {
    return "A required link is missing (e.g. organization or workspace). Please refresh and try again.";
  }
  if (code === '23502' || msg.includes('null value') || msg.includes('violates not-null')) {
    return 'A required field is missing. Please fill in all required fields and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** Current user's role in the org (for canAssignAdmin: only owner/admin can assign admin). */
export async function getCurrentUserOrgRole(orgId: string): Promise<OrgMemberRole | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: entity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!entity) return null;
  const { data: member } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('entity_id', entity.id)
    .maybeSingle();
  return (member?.role as OrgMemberRole) ?? null;
}

/** List roster for current org with status per member. Captain first in list. */
export async function getRoster(orgId: string): Promise<{ members: RosterMemberDisplay[]; captainId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let currentEntityId: string | null = null;
  if (user) {
    const { data: entity } = await supabase
      .from('entities')
      .select('id')
      .eq('auth_id', user.id)
      .maybeSingle();
    currentEntityId = entity?.id ?? null;
  }

  const rosterItems = await listOrgMembers(orgId);
  const emails = rosterItems.map((r) => r.email).filter(Boolean);
  const { data: invRows } = emails.length > 0
    ? await supabase
        .from('invitations')
        .select('email, status')
        .eq('organization_id', orgId)
        .in('email', emails)
    : { data: [] as { email: string; status: string }[] };
  const invitedEmails = new Set((invRows ?? []).map((r) => r.email.toLowerCase()));

  const captainId = currentEntityId
    ? rosterItems.find((r) => r.entity_id === currentEntityId)?.id ?? null
    : null;

  const sortedItems = [...rosterItems].sort((a, b) => {
    const aCaptain = currentEntityId != null && a.entity_id === currentEntityId ? 1 : 0;
    const bCaptain = currentEntityId != null && b.entity_id === currentEntityId ? 1 : 0;
    if (aCaptain !== bCaptain) return bCaptain - aCaptain;
    return 0;
  });
  const members: RosterMemberDisplay[] = sortedItems.map((r) => {
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.display_name || r.email;
    const isCaptain = currentEntityId != null && r.entity_id === currentEntityId;
    const isGhost = r.is_ghost && r.profile_id == null;
    const inviteSent = invitedEmails.has(r.email.toLowerCase());
    const isUnsentGhost = isGhost && !inviteSent;
    let status: RosterBadgeStatus = 'active';
    if (isCaptain) status = 'captain';
    else if (isGhost && inviteSent) status = 'invited';
    else if (isGhost) status = 'ghost';
    return {
      id: r.id,
      name,
      first_name: r.first_name,
      last_name: r.last_name,
      role: r.role,
      email: r.email,
      job_title: r.job_title ?? null,
      avatarUrl: r.avatar_url ?? null,
      isUnsentGhost,
      status,
    };
  });

  return { members, captainId };
}

/** Create or update a ghost member (no email sent). Uses entity + affiliation + org_member. */
export async function upsertGhostMember(
  orgId: string,
  input: UpsertGhostMemberInput,
  existingMemberId?: string | null
): Promise<UpsertGhostResult> {
  const parsed = upsertGhostMemberSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first?.message ?? 'Invalid input.' };
  }

  const { first_name, last_name, email, role, job_title, avatarUrl: inputAvatarUrl } = parsed.data;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: 'You must be signed in.' };

  const org = await getOrgDetails(orgId);
  if (!org) return { ok: false, error: 'Organization not found.' };
  const workspaceId = org.workspace_id;

  const emailTrim = email.trim();

  if (existingMemberId) {
    const myEntityId = await getCurrentEntityId();
    if (!myEntityId) return { ok: false, error: 'Your account is not linked to an organization.' };
    const { data: aff } = await supabase
      .from('affiliations')
      .select('organization_id')
      .eq('entity_id', myEntityId)
      .eq('organization_id', orgId)
      .in('access_level', ['admin', 'member'])
      .eq('status', 'active')
      .maybeSingle();
    if (!aff) return { ok: false, error: 'You do not have permission to add members to this organization.' };

    const { data: existing } = await supabase
      .from('org_members')
      .select('id, entity_id, profile_id')
      .eq('id', existingMemberId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (!existing) return { ok: false, error: 'Member not found.' };
    if (existing.profile_id != null) return { ok: false, error: 'Cannot edit a claimed member here.' };

    const entityId = existing.entity_id;
    if (!entityId) return { ok: false, error: 'Invalid member.' };

    await supabase.from('entities').update({ email: emailTrim }).eq('id', entityId);
    type OrgMemberRole = 'admin' | 'member' | 'owner' | 'restricted';
    const updatePayload: { first_name: string; last_name: string; job_title: string | null; role: OrgMemberRole; avatar_url?: string | null } = {
      first_name,
      last_name,
      job_title: job_title?.trim() || null,
      role: (role === 'manager' ? 'member' : role) as OrgMemberRole,
    };
    if (inputAvatarUrl !== undefined) updatePayload.avatar_url = inputAvatarUrl || null;
    const { error: memberErr } = await supabase
      .from('org_members')
      .update(updatePayload)
      .eq('id', existingMemberId);
    if (memberErr) return { ok: false, error: normalizeRosterError(memberErr) };

    const name = [first_name, last_name].filter(Boolean).join(' ').trim() || emailTrim;
    revalidatePath('/settings/team');
    return {
      ok: true,
      member: {
        id: existingMemberId,
        name,
        first_name,
        last_name,
        role: (role === 'manager' ? 'member' : role) as 'admin' | 'member' | 'owner' | 'restricted',
        email: emailTrim,
        job_title: job_title?.trim() || null,
        avatarUrl: inputAvatarUrl ?? null,
        isUnsentGhost: true,
      },
    };
  }

  type OrgMemberRole = 'admin' | 'member' | 'owner' | 'restricted';
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('add_ghost_member', {
    p_org_id: orgId,
    p_workspace_id: workspaceId,
    p_first_name: first_name,
    p_last_name: last_name,
    p_email: emailTrim,
    p_role: (role === 'manager' ? 'member' : role) as OrgMemberRole,
    p_job_title: job_title?.trim() || null,
  });

  if (rpcErr) {
    return { ok: false, error: normalizeRosterError(rpcErr) };
  }
  const result = rpcResult as { ok: boolean; error?: string; id?: string; name?: string; first_name?: string; last_name?: string; role?: string; email?: string; job_title?: string | null } | null;
  if (!result || !result.ok) {
    return { ok: false, error: result?.error ?? 'Failed to add member.' };
  }

  if (inputAvatarUrl && result.id) {
    await supabase.from('org_members').update({ avatar_url: inputAvatarUrl }).eq('id', result.id);
  }

  // Non-fatal cortex ROSTER_MEMBER edge mirror for newly created ghost member
  if (result.id) {
    const { data: newOm } = await supabase
      .from('org_members').select('entity_id').eq('id', result.id).maybeSingle();
    if (newOm?.entity_id) {
      const [personDirRes, orgDirRes] = await Promise.all([
        supabase.schema('directory').from('entities').select('id').eq('legacy_entity_id', newOm.entity_id).maybeSingle(),
        supabase.schema('directory').from('entities').select('id').eq('legacy_org_id', orgId).maybeSingle(),
      ]);
      if (personDirRes.data?.id && orgDirRes.data?.id) {
        await supabase.rpc('upsert_relationship', {
          p_source_entity_id: personDirRes.data.id,
          p_target_entity_id: orgDirRes.data.id,
          p_type: 'ROSTER_MEMBER',
          p_context_data: { first_name: result.first_name ?? first_name, last_name: result.last_name ?? last_name, role: result.role ?? role, job_title: result.job_title ?? job_title?.trim() ?? null },
        });
      }
    }
  }

  const name = (result.name ?? [result.first_name, result.last_name].filter(Boolean).join(' ').trim()) || result.email || emailTrim;
  revalidatePath('/settings/team');
  return {
    ok: true,
    member: {
      id: result.id!,
      name,
      first_name: result.first_name ?? first_name,
      last_name: result.last_name ?? last_name,
      role: (result.role ?? role) as 'admin' | 'member' | 'owner' | 'restricted',
      email: result.email ?? emailTrim,
      job_title: result.job_title ?? job_title?.trim() ?? null,
      avatarUrl: inputAvatarUrl ?? null,
      isUnsentGhost: true,
    },
  };
}

/** Invite by email only (e.g. TeamAssembler). Resolves current org, creates ghost, returns InviteEmployeeResult. */
export async function inviteEmployee(email: string): Promise<InviteEmployeeResult> {
  const orgId = await getCurrentOrgId();
  if (!orgId) return { ok: false, error: 'No organization selected. Open Network or Settings to pick one.' };
  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: 'Email is required.' };
  const namePart = trimmed.split('@')[0] ?? 'User';
  const result = await upsertGhostMember(orgId, {
    email: trimmed,
    first_name: namePart,
    last_name: 'Invited',
    role: 'member',
    job_title: null,
  });
  if (result.ok) return { ok: true, message: `Invite added for ${trimmed}.` };
  return { ok: false, error: result.error };
}

/** Deploy invites: create invitation rows and send emails for unsent ghosts. */
export async function deployInvites(orgId: string, memberIds: string[]): Promise<DeployInvitesResult> {
  if (memberIds.length === 0) return { ok: true, sent: 0 };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: 'You must be signed in.' };

  const { data: myEntity } = await supabase
    .from('entities')
    .select('id')
    .eq('auth_id', user.id)
    .maybeSingle();
  if (!myEntity) return { ok: false, error: 'Unauthorized.' };

  const { data: aff } = await supabase
    .from('affiliations')
    .select('organization_id')
    .eq('entity_id', myEntity.id)
    .eq('organization_id', orgId)
    .in('access_level', ['admin', 'member'])
    .eq('status', 'active')
    .maybeSingle();
  if (!aff) return { ok: false, error: 'You do not have permission to send invites for this organization.' };

  const { data: members } = await supabase
    .from('org_members')
    .select('id, entity_id, first_name, last_name')
    .eq('org_id', orgId)
    .in('id', memberIds)
    .is('profile_id', null);

  if (!members?.length) return { ok: true, sent: 0 };

  const entityIds = [...new Set(members.map((m) => m.entity_id).filter(Boolean))] as string[];
  const { data: entities } = await supabase
    .from('entities')
    .select('id, email')
    .in('id', entityIds);
  const emailByEntityId = new Map((entities ?? []).map((e) => [e.id, e.email]));

  let sent = 0;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  for (const m of members) {
    const email = m.entity_id ? emailByEntityId.get(m.entity_id) : null;
    if (!email?.trim()) continue;

    const { data: existing } = await supabase
      .from('invitations')
      .select('id')
      .eq('organization_id', orgId)
      .ilike('email', email.trim())
      .maybeSingle();
    if (existing) continue;

    const token = randomBytes(24).toString('hex');
    const { error: invErr } = await supabase.from('invitations').insert({
      organization_id: orgId,
      created_by_org_id: orgId,
      email: email.trim(),
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    });
    if (invErr) continue;
    sent++;
    // TODO: send email with invite link (e.g. /claim?token=…)
  }

  return { ok: true, sent };
}

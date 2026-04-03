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
import type { OrgMemberRole } from '@/entities/organization/model/types';
import { sendEmployeeInviteEmail } from '@/shared/api/email/send';

export type AcceptEmployeeInviteResult = { ok: true } | { ok: false; error: string };
export type InviteEmployeeResult = { ok: true; message: string } | { ok: false; error: string };
export type UpsertGhostResult = { ok: true; member: RosterBadgeData } | { ok: false; error: string };
export type DeployInvitesResult = { ok: true; sent: number } | { ok: false; error: string };

/** Map DB/Supabase errors to Unusonic-friendly messages (no raw RLS or constraint text). */
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

  // Find person entity by auth user
  const { data: personEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!personEnt) return null;

  // Find org entity by legacy org id
  const { data: orgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();
  if (!orgEnt) return null;

  // Find ROSTER_MEMBER edge
  const { data: rel } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('context_data')
    .eq('source_entity_id', personEnt.id)
    .eq('target_entity_id', orgEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  return ((rel?.context_data as Record<string, unknown>)?.role as OrgMemberRole) ?? null;
}

/** List roster for current org with status per member. Captain first in list. */
export async function getRoster(orgId: string): Promise<{ members: RosterMemberDisplay[]; captainId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let currentEntityId: string | null = null;
  if (user) {
    const { data: entity } = await supabase
      .schema('directory')
      .from('entities')
      .select('id')
      .eq('claimed_by_user_id', user.id)
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

/** Create or update a ghost member (no email sent). Uses add_ghost_member RPC / cortex.relationships. */
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

    // Auth check: verify caller has a ROSTER_MEMBER or MEMBER edge to this org
    const { data: orgEntForAuth } = await supabase
      .schema('directory')
      .from('entities')
      .select('id')
      .eq('legacy_org_id', orgId)
      .maybeSingle();
    if (!orgEntForAuth) return { ok: false, error: 'Organization not found.' };

    const { data: authRel } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('context_data')
      .eq('source_entity_id', myEntityId)
      .eq('target_entity_id', orgEntForAuth.id)
      .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
      .maybeSingle();
    if (!authRel) return { ok: false, error: 'You do not have permission to add members to this organization.' };

    // Fetch the relationship by its cortex edge UUID
    const { data: rel } = await supabase
      .schema('cortex')
      .from('relationships')
      .select('id, source_entity_id, target_entity_id, context_data')
      .eq('id', existingMemberId)
      .eq('relationship_type', 'ROSTER_MEMBER')
      .maybeSingle();
    if (!rel) return { ok: false, error: 'Member not found.' };

    // Check the person entity has not been claimed
    const { data: personEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('claimed_by_user_id')
      .eq('id', rel.source_entity_id)
      .maybeSingle();
    if (personEnt?.claimed_by_user_id != null) return { ok: false, error: 'Cannot edit a claimed member here.' };

    // Update email on directory entity
    await supabase.rpc('patch_entity_attributes', {
      p_entity_id: rel.source_entity_id,
      p_attributes: { email: emailTrim },
    });

    // Update roster fields via patch_relationship_context
    const dbRole = role === 'manager' ? 'member' : role;
    const patch: Record<string, unknown> = {
      first_name,
      last_name,
      job_title: job_title?.trim() || null,
      role: dbRole,
    };
    if (inputAvatarUrl !== undefined) patch.avatar_url = inputAvatarUrl || null;

    const { error: patchErr } = await supabase.rpc('patch_relationship_context', {
      p_source_entity_id: rel.source_entity_id,
      p_target_entity_id: rel.target_entity_id,
      p_relationship_type: 'ROSTER_MEMBER',
      p_patch: patch,
    });
    if (patchErr) return { ok: false, error: normalizeRosterError(patchErr) };

    // If avatar supplied, also update directory.entities.avatar_url directly
    if (inputAvatarUrl !== undefined) {
      await supabase
        .schema('directory')
        .from('entities')
        .update({ avatar_url: inputAvatarUrl || null })
        .eq('id', rel.source_entity_id);
    }

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

  type RpcOrgMemberRole = 'admin' | 'member' | 'owner' | 'restricted';
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('add_ghost_member', {
    p_org_id: orgId,
    p_workspace_id: workspaceId,
    p_first_name: first_name,
    p_last_name: last_name,
    p_email: emailTrim,
    p_role: (role === 'manager' ? 'member' : role) as RpcOrgMemberRole,
    p_job_title: job_title?.trim() || null,
  });

  if (rpcErr) {
    return { ok: false, error: normalizeRosterError(rpcErr) };
  }
  const result = rpcResult as {
    ok: boolean;
    error?: string;
    id?: string;
    entity_id?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    role?: string;
    email?: string;
    job_title?: string | null;
  } | null;
  if (!result || !result.ok) {
    return { ok: false, error: result?.error ?? 'Failed to add member.' };
  }

  // Update avatar on directory entity if supplied (add_ghost_member returns entity_id)
  if (inputAvatarUrl && result.entity_id) {
    await supabase
      .schema('directory')
      .from('entities')
      .update({ avatar_url: inputAvatarUrl })
      .eq('id', result.entity_id);
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

/** Send invites: create invitation rows and send emails for unsent ghosts. */
export async function deployInvites(orgId: string, memberIds: string[]): Promise<DeployInvitesResult> {
  if (memberIds.length === 0) return { ok: true, sent: 0 };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) return { ok: false, error: 'You must be signed in.' };

  // Resolve caller's directory entity
  const { data: myEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!myEntity) return { ok: false, error: 'Unauthorized.' };

  // Auth check: verify caller has a ROSTER_MEMBER or MEMBER edge to this org
  const { data: myOrgEnt } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('legacy_org_id', orgId)
    .maybeSingle();
  if (!myOrgEnt) return { ok: false, error: 'You do not have permission to send invites for this organization.' };

  const { data: authRel2 } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id')
    .eq('source_entity_id', myEntity.id)
    .eq('target_entity_id', myOrgEnt.id)
    .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
    .maybeSingle();
  if (!authRel2) return { ok: false, error: 'You do not have permission to send invites for this organization.' };

  // Resolve workspace info for email sending
  const org = await getOrgDetails(orgId);
  const workspaceId = org?.workspace_id ?? null;
  let workspaceName = 'Unusonic';
  if (workspaceId) {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspaceId)
      .maybeSingle();
    workspaceName = (ws as { name?: string } | null)?.name ?? 'Unusonic';
  }

  // Resolve inviter name from profile
  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();
  const inviterName = (inviterProfile as { full_name?: string } | null)?.full_name ?? null;

  // Resolve org entity for the member edge lookup (same as myOrgEnt above)
  const orgEntForDeploy = myOrgEnt;

  // Fetch matching ROSTER_MEMBER edges by edge UUID (memberIds are cortex edge UUIDs)
  const { data: rels } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('id, source_entity_id, context_data')
    .eq('target_entity_id', orgEntForDeploy.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .in('id', memberIds);
  if (!rels?.length) return { ok: true, sent: 0 };

  // Batch-fetch person entities to check claimed status and get email
  const sourceIds = rels.map((r) => r.source_entity_id);
  const { data: personEnts } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, claimed_by_user_id, attributes')
    .in('id', sourceIds);
  const personById = new Map((personEnts ?? []).map((e) => [e.id, e]));

  // Filter to unclaimed ghosts only with a valid email
  type DeployMember = { id: string; entity_id: string; email: string; first_name?: string; last_name?: string };
  const members: DeployMember[] = rels
    .map((r): DeployMember | null => {
      const ent = personById.get(r.source_entity_id);
      if (!ent || ent.claimed_by_user_id != null) return null;
      const attrs = (ent.attributes as Record<string, unknown>) ?? {};
      const ctx = (r.context_data as Record<string, unknown>) ?? {};
      const email = attrs.email as string | undefined;
      if (!email) return null;
      const first_name =
        (ctx.first_name as string | undefined) ?? (attrs.first_name as string | undefined);
      const last_name =
        (ctx.last_name as string | undefined) ?? (attrs.last_name as string | undefined);
      return { id: r.id, entity_id: r.source_entity_id, email, first_name, last_name };
    })
    .filter((m): m is DeployMember => m !== null);

  if (!members.length) return { ok: true, sent: 0 };

  let sent = 0;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  for (const m of members) {
    if (!m.email.trim()) continue;

    const { data: existing } = await supabase
      .from('invitations')
      .select('id')
      .eq('organization_id', orgId)
      .ilike('email', m.email.trim())
      .maybeSingle();
    if (existing) continue;

    const token = randomBytes(24).toString('hex');
    const { error: invErr } = await supabase.from('invitations').insert({
      organization_id: orgId,
      created_by_org_id: orgId,
      email: m.email.trim(),
      token,
      expires_at: expiresAt.toISOString(),
      status: 'pending',
    });
    if (invErr) continue;
    sent++;

    // Send invite email (best-effort — invitation row exists even if email fails)
    if (workspaceId) {
      await sendEmployeeInviteEmail({
        to: m.email.trim(),
        token,
        workspaceId,
        workspaceName,
        inviterName,
      }).catch(() => {
        // Email failure is non-fatal; the invite link is still valid
      });
    }
  }

  return { ok: true, sent };
}

/**
 * Accept an employee invite: claim the ghost person entity and mark invitation accepted.
 * Unlike claimOrganization (which makes the user an org owner), this just claims the
 * person entity. The ROSTER_MEMBER edge already exists from add_ghost_member.
 * If workspace_members row doesn't exist yet, it's created here with the employee role.
 */
export async function acceptEmployeeInvite(
  token: string
): Promise<AcceptEmployeeInviteResult> {
  if (!token?.trim()) return { ok: false, error: 'Missing token.' };

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.email) {
    return { ok: false, error: 'You must be signed in to accept this invite.' };
  }

  // Validate invitation
  const { data: invitation, error: invError } = await supabase
    .from('invitations')
    .select('id, organization_id, email, status, expires_at')
    .eq('token', token.trim())
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (invError || !invitation) {
    return { ok: false, error: 'Invalid or expired invitation.' };
  }
  if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
    return { ok: false, error: 'This invitation was sent to a different email address.' };
  }

  // Find the ghost person entity for this email
  const { data: ghostPerson } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id')
    .ilike('attributes->>email', user.email)
    .eq('type', 'person')
    .is('claimed_by_user_id', null)
    .maybeSingle();
  if (!ghostPerson) {
    return { ok: false, error: 'No matching team member found for this email.' };
  }

  // Claim the ghost person entity
  const { error: claimErr } = await supabase
    .schema('directory')
    .from('entities')
    .update({ claimed_by_user_id: user.id })
    .eq('id', ghostPerson.id);
  if (claimErr) {
    return { ok: false, error: 'Failed to link your account.' };
  }

  // Ensure workspace_members row exists (may already exist if inviteTeamMember was used)
  const workspaceId = ghostPerson.owner_workspace_id;
  if (workspaceId) {
    const { data: existingMember } = await supabase
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!existingMember) {
      // Look up the employee system role
      const { data: employeeRole } = await supabase
        .schema('ops')
        .from('workspace_roles')
        .select('id')
        .eq('slug', 'employee')
        .is('workspace_id', null)
        .maybeSingle();

      await supabase.from('workspace_members').insert({
        workspace_id: workspaceId,
        user_id: user.id,
        role_id: employeeRole?.id ?? null,
        role: 'member', // legacy fallback
      });
    }
  }

  // Mark invitation as accepted
  await supabase
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', invitation.id);

  return { ok: true };
}

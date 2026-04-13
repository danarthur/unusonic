/**
 * Network Orbit – Org member management: update ghost members, add contacts, role changes.
 * @module features/network-data/api/member-actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getCurrentEntityAndOrg } from './network-helpers';

/**
 * Update a ghost org member (role, job_title, avatar_url, phone). Creator org only.
 */
export async function updateGhostMember(
  sourceOrgId: string,
  memberId: string,
  payload: { role?: string | null; jobTitle?: string | null; avatarUrl?: string | null; phone?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Unauthorized.' };

  const { data: result, error } = await supabase.rpc('update_ghost_member', {
    p_creator_org_id: sourceOrgId,
    p_member_id: memberId,
    p_role: payload.role ?? null,
    p_job_title: payload.jobTitle ?? null,
    p_avatar_url: payload.avatarUrl ?? null,
    p_phone: payload.phone ?? null,
  });

  if (error) return { ok: false, error: error.message };
  const res = result as { ok?: boolean; error?: string } | null;
  if (res && res.ok === false && res.error) return { ok: false, error: res.error };
  revalidatePath('/network');
  return { ok: true };
}

/**
 * Add a contact (ghost entity + org_member) to a ghost org. Only the org that created the ghost may add.
 * Used by Node Detail Sheet → Crew tab "Add contact".
 * Inserts entity + org_member directly so the creator can add crew without being a member of the ghost org
 * (add_ghost_member RPC requires membership in the target org and blocks ghost connections).
 */
export async function addContactToGhostOrg(
  sourceOrgId: string,
  ghostOrgId: string,
  payload: { firstName: string; lastName: string; email?: string | null; role?: string | null; jobTitle?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, error: 'Unauthorized.' };

  // Session 9: look up ghost org in directory.entities only (legacy organizations fallback removed)
  const { data: ghostOrgDir } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id, attributes')
    .or(`legacy_org_id.eq.${ghostOrgId},id.eq.${ghostOrgId}`)
    .maybeSingle();

  if (!ghostOrgDir?.owner_workspace_id) return { ok: false, error: 'Partner org not found.' };
  const ghostWorkspaceId = ghostOrgDir.owner_workspace_id;
  const attrs = (ghostOrgDir.attributes as Record<string, unknown>) ?? {};
  const createdByOrgId = (attrs.created_by_org_id as string | null) ?? null;
  if (createdByOrgId !== sourceOrgId) return { ok: false, error: 'Only the org that created this partner can add crew.' };

  const firstName = (payload.firstName ?? '').trim() || 'Contact';
  const lastName = (payload.lastName ?? '').trim() ?? '';
  const emailVal =
    (payload.email ? String(payload.email).trim() : '') ||
    `ghost-${crypto.randomUUID()}@unusonic.local`;
  const role = (payload.role ? String(payload.role).trim() : null) ?? 'member';
  const jobTitle = payload.jobTitle ? String(payload.jobTitle).trim() || null : null;

  // Use add_contact_to_ghost_org RPC (already migrated to directory + cortex)
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('add_contact_to_ghost_org', {
    p_ghost_org_id: ghostOrgId,
    p_workspace_id: ghostWorkspaceId,
    p_creator_org_id: sourceOrgId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_email: emailVal,
    p_role: role,
    p_job_title: jobTitle,
  });
  if (rpcErr) return { ok: false, error: rpcErr.message ?? 'Failed to add to crew.' };

  // RPC returns jsonb { ok, error } — check the payload, not just the Postgres error
  const rpcPayload = rpcResult as { ok?: boolean; error?: string } | null;
  if (rpcPayload && rpcPayload.ok === false) {
    return { ok: false, error: rpcPayload.error ?? 'Failed to add to crew.' };
  }

  revalidatePath('/network');
  return { ok: true };
}

/** Batch-add Scout roster to ghost org via add_contact_to_ghost_org RPC. */
export async function addScoutRosterToGhostOrg(
  sourceOrgId: string,
  ghostOrgId: string,
  roster: Array<{ firstName: string; lastName: string; jobTitle?: string | null; avatarUrl?: string | null; email?: string | null }>
): Promise<{ ok: boolean; addedCount: number; error?: string }> {
  if (!roster?.length) return { ok: true, addedCount: 0 };
  const supabase = await createClient();
  const { orgId } = await getCurrentEntityAndOrg(supabase);
  if (!orgId || orgId !== sourceOrgId) return { ok: false, addedCount: 0, error: 'Unauthorized.' };

  // Session 9: look up ghost org in directory.entities only
  const { data: ghostOrgDir2 } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, owner_workspace_id, attributes')
    .or(`legacy_org_id.eq.${ghostOrgId},id.eq.${ghostOrgId}`)
    .maybeSingle();
  if (!ghostOrgDir2?.owner_workspace_id) return { ok: false, addedCount: 0, error: 'Partner org not found.' };
  const ghostWorkspaceId2 = ghostOrgDir2.owner_workspace_id;
  const attrs2 = (ghostOrgDir2.attributes as Record<string, unknown>) ?? {};
  const createdByOrgId2 = (attrs2.created_by_org_id as string | null) ?? null;
  if (createdByOrgId2 !== sourceOrgId) return { ok: false, addedCount: 0, error: 'Only the org that created this partner can add crew.' };

  let addedCount = 0;
  let firstError: string | null = null;

  for (const m of roster) {
    const firstName = (m.firstName ?? '').trim() || 'Contact';
    const lastName = (m.lastName ?? '').trim() ?? '';
    const emailRaw = m.email && typeof m.email === 'string' ? m.email.trim() : '';
    const emailVal = emailRaw || `ghost-${crypto.randomUUID()}@unusonic.local`;
    const jobTitle = m.jobTitle && typeof m.jobTitle === 'string' ? m.jobTitle.trim() || null : null;

    const { error: rpcErr } = await supabase.rpc('add_contact_to_ghost_org', {
      p_ghost_org_id: ghostOrgId,
      p_workspace_id: ghostWorkspaceId2,
      p_creator_org_id: sourceOrgId,
      p_first_name: firstName,
      p_last_name: lastName,
      p_email: emailVal,
      p_role: 'member',
      p_job_title: jobTitle,
    });

    if (rpcErr) {
      if (!firstError) firstError = rpcErr.message ?? 'Failed to add to crew';
      continue;
    }
    addedCount += 1;
  }

  revalidatePath('/network');
  if (firstError && addedCount === 0) {
    return { ok: false, addedCount: 0, error: firstError };
  }
  return { ok: true, addedCount };
}

// ---------------------------------------------------------------------------
// Org member role management
// ---------------------------------------------------------------------------

export type UpdateOrgMemberRoleResult = { ok: true } | { ok: false; error: string };

const ORG_MEMBER_ROLES = ['owner', 'admin', 'member', 'restricted'] as const;
type OrgMemberRoleDb = (typeof ORG_MEMBER_ROLES)[number];

/**
 * Update an internal team member's role via cortex.relationships context_data.
 * Session 9: reads from directory.entities + cortex.relationships.
 * orgMemberId is a cortex.relationships.id.
 */
export async function updateOrgMemberRole(
  orgMemberId: string,
  sourceOrgId: string,
  newRole: 'owner' | 'admin' | 'manager' | 'member' | 'restricted'
): Promise<UpdateOrgMemberRoleResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  // Get caller's directory entity + their org role
  const { data: callerEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('claimed_by_user_id', user.id).maybeSingle();
  if (!callerEnt) return { ok: false, error: 'Account not linked.' };

  const { data: orgDirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id').eq('legacy_org_id', sourceOrgId).maybeSingle();
  if (!orgDirEnt) return { ok: false, error: 'Organization not found.' };

  const { data: callerRel } = await supabase
    .schema('cortex').from('relationships')
    .select('context_data')
    .eq('source_entity_id', callerEnt.id)
    .eq('target_entity_id', orgDirEnt.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();
  const callerCtx = (callerRel?.context_data as Record<string, unknown>) ?? {};
  const currentRole = (callerCtx.role as OrgMemberRoleDb | null) ?? null;

  if (!currentRole || !['owner', 'admin'].includes(currentRole)) {
    return { ok: false, error: 'Only owners and admins can change roles.' };
  }
  if (newRole === 'owner' && currentRole !== 'owner') {
    return { ok: false, error: 'Only the owner can assign the owner role.' };
  }

  const dbRole: OrgMemberRoleDb = newRole === 'manager' ? 'member' : newRole;

  // Look up target member's cortex relationship
  const { data: targetRel } = await supabase
    .schema('cortex').from('relationships')
    .select('id, source_entity_id, target_entity_id, relationship_type, context_data')
    .eq('id', orgMemberId)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();
  if (!targetRel) return { ok: false, error: 'Member not found.' };

  const existingCtx = (targetRel.context_data as Record<string, unknown>) ?? {};
  const { error: rpcErr } = await supabase.rpc('upsert_relationship', {
    p_source_entity_id: targetRel.source_entity_id,
    p_target_entity_id: targetRel.target_entity_id,
    p_type: targetRel.relationship_type,
    p_context_data: { ...existingCtx, role: dbRole },
  });

  if (rpcErr) return { ok: false, error: rpcErr.message };
  revalidatePath('/network');
  revalidatePath('/settings/team');
  return { ok: true };
}

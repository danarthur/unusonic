 
/**
 * Workspace Server Actions
 * Handles workspace setup and management
 * @module app/actions/workspace
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { revalidatePath } from 'next/cache';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { getOrgDetails } from '@/features/org-management/api';
import {
  inviteTeamMemberPayloadSchema,
  type InviteTeamMemberPayload,
} from '@/app/actions/invite-team-member-schema';
import {
  offboardTeamMemberPayloadSchema,
  type OffboardTeamMemberPayload,
} from '@/app/actions/offboard-team-member-schema';
import { canAddSeat } from '@/shared/lib/seat-limits';
import { writeLanded } from '@/shared/lib/write-landed';

// ============================================================================
// Types
// ============================================================================

/*
  WorkspacePermissions and SetupWorkspaceResult lived here.

  The first described a `workspace_members.permissions` column that no longer
  exists; capabilities now hang off the member's role. The second described the
  return of a function deleted in the commit before this one.
*/

// ============================================================================
// Setup Initial Workspace
// Creates workspace, default location, and owner membership
// ============================================================================

/*
  setupInitialWorkspace lived here and is gone.

  Dead in two independent ways: nothing in the codebase called it, and its
  second statement inserted into a `locations` table that does not exist in
  the database. It would have failed on any invocation it ever received.

  It also carried the exact defect that produced an orphaned workspace in
  production: it created the workspace with the AUTHENTICATED client, then
  rolled back with `supabase.from('workspaces').delete()` -- and
  public.workspaces has RLS policies for INSERT and SELECT and none for
  DELETE. That statement matches zero rows and PostgREST does not call it an
  error, so the rollback would have reported success while leaving the
  workspace behind.

  `complete-setup.ts` is the live path and does this correctly, through the
  service-role client. A dead creation path with a silent rollback is worse
  than no path.
*/

/*
  updateMemberPermissions and updateMemberDepartment lived here and are gone.

  `public.workspace_members` holds four columns -- workspace_id, user_id, role,
  role_id. There is no `id`, no `permissions` and no `department`. Both actions
  selected `role, permissions` before doing anything else, so both returned a
  400 and bailed out with "Not a member of this workspace" shown to the
  workspace owner.

  They are not repaired, because what they were built on moved. Per-member
  JSONB permissions were replaced by roles: a member carries a `role_id` into
  `ops.workspace_roles`, whose permissions live in
  `ops.workspace_role_permissions`, and `member_has_capability` is what reads
  them. That model has its own editor at /settings/roles. Reinstating a second,
  per-member way to grant the same capabilities would put the two out of step
  the first time anyone used it.

  Department has no replacement because it had no reader beyond its own input.
*/

// ============================================================================
// Get Workspace Members
// ============================================================================

/**
 * A member of a workspace.
 *
 * There is no member id, because there is no member id column: the primary key
 * of `public.workspace_members` is (workspace_id, user_id). This type used to
 * claim an `id`, a `department`, a `permissions` object, a `primaryLocationId`
 * and a `joinedAt`, none of which the table has -- so the select that filled it
 * returned a 400 and every caller saw an empty team.
 */
export interface WorkspaceMemberData {
  /** The identity of a member, and the half of the key that is not the workspace. */
  userId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  /** Legacy text role (owner | admin | member | viewer) for display/fallback. */
  role: 'owner' | 'admin' | 'member' | 'viewer';
  /** Resolved role from workspace_roles when role_id is set. */
  roleId: string | null;
  roleName: string | null;
  /** Cortex ROSTER_MEMBER edge ID (null if no roster entry). */
  rosterEdgeId: string | null;
  /** Admin override portal profile key (null = auto-detect). */
  portalProfile: string | null;
}

/**
 * Fetches all members of a workspace with their profile data
 */
export async function getWorkspaceMembers(
  workspaceId: string
): Promise<{ success: boolean; members?: WorkspaceMemberData[]; error?: string }> {
  const supabase = await createClient();
  
  const { data: members, error } = await supabase
    .from('workspace_members')
    .select(`
      user_id,
      role,
      role_id,
      profiles:user_id (
        email,
        full_name,
        avatar_url
      ),
      workspace_roles:role_id (
        id,
        name,
        slug
      )
    `)
    .eq('workspace_id', workspaceId)
    .order('role');

  if (error) {
    return { success: false, error: error.message };
  }

  // Batch-fetch roster edge IDs + portal profile overrides for all members
  const userIds = members.map(m => m.user_id);
  const rosterMap = new Map<string, { edgeId: string; portalProfile: string | null }>();

  if (userIds.length > 0) {
    // Step 1: Find person entities claimed by these users
    const { data: personEntities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, claimed_by_user_id')
      .in('claimed_by_user_id', userIds)
      .eq('type', 'person');

    if (personEntities && personEntities.length > 0) {
      const entityIds = personEntities.map(e => e.id);
      const entityToUser = new Map(personEntities.map(e => [e.id, e.claimed_by_user_id!]));

      // Step 2: Find ROSTER_MEMBER edges for these entities
      const { data: rosterEdges } = await supabase
        .schema('cortex')
        .from('relationships')
        .select('id, source_entity_id, context_data')
        .in('source_entity_id', entityIds)
        .eq('relationship_type', 'ROSTER_MEMBER');

      if (rosterEdges) {
        for (const edge of rosterEdges) {
          const userId = entityToUser.get(edge.source_entity_id);
          if (userId) {
            const ctx = (edge.context_data ?? {}) as Record<string, unknown>;
            rosterMap.set(userId, {
              edgeId: edge.id,
              portalProfile: (ctx.primary_portal_profile as string) ?? null,
            });
          }
        }
      }
    }
  }

  const formattedMembers: WorkspaceMemberData[] = members.map((m) => {
    const rawProfile = m.profiles;
    const profile = (Array.isArray(rawProfile) ? rawProfile[0] : rawProfile) as { email: string; full_name: string | null; avatar_url: string | null } | null;
    const rawRole = m.workspace_roles;
    const roleRow = Array.isArray(rawRole) ? rawRole[0] : rawRole;
    const roleName = roleRow && typeof roleRow === 'object' && roleRow !== null && 'name' in roleRow ? (roleRow as { name: string }).name : null;
    const roster = rosterMap.get(m.user_id);
    return {
      userId: m.user_id,
      email: profile?.email || '',
      fullName: profile?.full_name || null,
      avatarUrl: profile?.avatar_url || null,
      role: m.role as 'owner' | 'admin' | 'member' | 'viewer',
      roleId: m.role_id ?? null,
      roleName,
      rosterEdgeId: roster?.edgeId ?? null,
      portalProfile: roster?.portalProfile ?? null,
    };
  });

  return { success: true, members: formattedMembers };
}

// ============================================================================
// Offboard Team Member (surgical removal: revoke access ± roster)
// ============================================================================

export type OffboardTeamMemberResult =
  | { success: true; message: string }
  | { success: false; error: string };

/**
 * Offboard a team member: revoke workspace access and optionally remove from roster.
 * Directory-centric: we never delete directory.entities or deal_stakeholders; we only remove
 * workspace_members and (if full_offboard) org_members for the current org.
 *
 * Step 1 (Safeguard): If this user is the last owner in the workspace, abort.
 * Step 2: Delete from workspace_members (revokes login and RLS).
 * Step 3: If revoke_login_only, leave org_members and entities intact. If full_offboard, remove
 * their org_members row(s) for the org linked to this workspace; entities and deal_stakeholders are preserved.
 */
export async function offboardTeamMember(
  payload: OffboardTeamMemberPayload
): Promise<OffboardTeamMemberResult> {
  const parsed = offboardTeamMemberPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message ?? 'Invalid input.' };
  }

  const { user_id: targetUserId, workspace_id: workspaceId, intent } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  const { data: canManage } = await supabase.rpc('user_has_workspace_role', {
    p_workspace_id: workspaceId,
    p_roles: ['owner', 'admin'],
  });
  if (canManage !== true) {
    return { success: false, error: 'You do not have permission to offboard members in this workspace.' };
  }

  if (targetUserId === user.id) {
    return { success: false, error: 'You cannot offboard yourself. Ask another owner or admin to remove you.' };
  }

  const { data: targetRow } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId)
    .maybeSingle();

  if (!targetRow) {
    return { success: false, error: 'This person is not a member of this workspace.' };
  }

  // Step 1 (Safeguard): Do not remove the last owner.
  const isOwner = targetRow.role === 'owner';
  if (isOwner) {
    const { count, error: countErr } = await supabase
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner');
    if (countErr || (count ?? 0) <= 1) {
      return {
        success: false,
        error: 'Cannot remove the last Owner. Assign another member as Owner first.',
      };
    }
  }

  // Step 2: Revoke software access — delete from workspace_members.
  // `.select()` so a zero-row delete is a failure rather than a success. The
  // authenticated client cannot delete from public.workspace_members at all --
  // the table has no DELETE policy -- and without this the action would report
  // that it had revoked access it had not revoked.
  const revoked = writeLanded(
    await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspaceId)
      .eq('user_id', targetUserId)
      .select('user_id'),
    'the access change',
  );
  if (!revoked.ok) {
    return { success: false, error: revoked.error };
  }

  // Step 3: Roster management (only for full_offboard).
  if (intent === 'full_offboard') {
    // Resolve user_id → directory.entities person entity.
    const { data: dirEnt } = await supabase
      .schema('directory')
      .from('entities')
      .select('id')
      .eq('claimed_by_user_id', targetUserId)
      .maybeSingle();

    if (dirEnt?.id) {
      // Find org entities owned by this workspace
      const { data: orgDirEnts } = await supabase
        .schema('directory')
        .from('entities')
        .select('id')
        .eq('owner_workspace_id', workspaceId)
        .eq('type', 'company');

      const orgEntityIds = (orgDirEnts ?? []).map((e) => e.id);

      // Soft-delete ROSTER_MEMBER edges from person to workspace orgs
      for (const orgEntityId of orgEntityIds) {
        const { data: relRow } = await supabase
          .schema('cortex')
          .from('relationships')
          .select('id, context_data')
          .eq('source_entity_id', dirEnt.id)
          .eq('target_entity_id', orgEntityId)
          .in('relationship_type', ['ROSTER_MEMBER', 'MEMBER'])
          .is('ended_at', null)
          .maybeSingle();
        if (relRow) {
          const ctx = (relRow.context_data as Record<string, unknown>) ?? {};
          await supabase.rpc('upsert_relationship', {
            p_source_entity_id: dirEnt.id,
            p_target_entity_id: orgEntityId,
            p_type: 'ROSTER_MEMBER',
            p_context_data: { ...ctx, deleted_at: new Date().toISOString() },
          });
        }
      }
    }
    // directory.entities and deal_stakeholders are preserved — history is intact.
  }

  revalidatePath('/settings');
  revalidatePath('/settings/team');
  revalidatePath('/network');

  if (intent === 'revoke_login_only') {
    return { success: true, message: 'App access revoked. They remain on your roster.' };
  }
  return { success: true, message: 'Member offboarded. App access revoked and removed from active roster. Past event data is preserved.' };
}

// ============================================================================
// Invite Team Member (dual-write: roster + optional workspace access)
// ============================================================================

export type InviteTeamMemberResult =
  | { success: true; message: string }
  | { success: false; error: string }
  | { success: false; error: 'seat_limit_reached'; current: number; limit: number };

/** DB org_member_role: owner, admin, member, restricted (no manager; map manager → member). */
const INTERNAL_ROLE_TO_DB: Record<string, 'owner' | 'admin' | 'member' | 'restricted'> = {
  owner: 'owner',
  admin: 'admin',
  manager: 'member',
  member: 'member',
  restricted: 'restricted',
};

const WORKSPACE_ROLE_SLUG_TO_LEGACY: Record<string, 'owner' | 'admin' | 'member' | 'viewer'> = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
  observer: 'viewer',
  employee: 'member', // employee role uses 'member' as legacy fallback
};

/**
 * Invite a team member: add to roster (org_members) and optionally grant Unusonic login (Auth invite + workspace_members).
 * Roster and software access are decoupled; grant_workspace_access controls whether we send an Auth invite and add workspace_members.
 * If Step 2 (Auth invite or workspace_members insert) fails, Step 1 (roster) is rolled back.
 */
export async function inviteTeamMember(
  payload: InviteTeamMemberPayload
): Promise<InviteTeamMemberResult> {
  const parsed = inviteTeamMemberPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message ?? 'Invalid input.' };
  }

  const {
    workspace_id: workspaceId,
    first_name,
    last_name,
    email,
    internal_role,
    job_title,
    grant_workspace_access,
    workspace_role_id,
  } = parsed.data;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  const orgId = await getCurrentOrgId();
  if (!orgId) return { success: false, error: 'No organization selected. Open Network or Settings to pick one.' };

  const org = await getOrgDetails(orgId);
  if (!org?.workspace_id) return { success: false, error: 'Organization not found or not linked to a workspace.' };
  if (org.workspace_id !== workspaceId) {
    return { success: false, error: 'This workspace does not match your organization. Use the correct workspace.' };
  }

  // Through the RPC, because the membership row no longer carries a
  // `permissions` column -- selecting it here returned a 400, so this gate
  // denied everyone, the workspace owner included.
  const { data: canManage } = await supabase.rpc('user_has_workspace_role', {
    p_workspace_id: workspaceId,
    p_roles: ['owner', 'admin'],
  });
  if (canManage !== true) {
    return { success: false, error: 'You do not have permission to invite team members to this workspace.' };
  }

  const dbRole = INTERNAL_ROLE_TO_DB[internal_role] ?? 'member';

  // Step 1: Roster — entity + org_member (via add_ghost_member RPC)
  const { data: rpcResult, error: rpcErr } = await supabase.rpc('add_ghost_member', {
    p_org_id: orgId,
    p_workspace_id: workspaceId,
    p_first_name: first_name.trim(),
    p_last_name: last_name.trim(),
    p_email: email.trim(),
    p_role: dbRole,
    p_job_title: job_title?.trim() || undefined,
  });

  if (rpcErr) {
    const msg = rpcErr.message ?? 'Failed to add to roster.';
    if (rpcErr.code === '23505' || msg.toLowerCase().includes('unique')) {
      return { success: false, error: 'This email is already on the roster. Use a different address or edit the existing member.' };
    }
    return { success: false, error: msg };
  }

  const result = rpcResult as { ok?: boolean; id?: string; error?: string } | null;
  if (!result?.ok || !result.id) {
    return { success: false, error: result?.error ?? 'Failed to add to roster.' };
  }

  const orgMemberId = result.id;
  // entity_id is returned by add_ghost_member RPC (directory.entities.id of the ghost person)
  const entityIdForRollback = (result as { ok?: boolean; id?: string; entity_id?: string; error?: string } | null)?.entity_id ?? null;

  if (!grant_workspace_access) {
    revalidatePath('/settings');
    revalidatePath('/settings/team');
    revalidatePath('/network');
    return { success: true, message: `${first_name} ${last_name} has been added to the roster. No login invite was sent.` };
  }

  if (!workspace_role_id) {
    await rollbackRosterStep(supabase, orgMemberId, entityIdForRollback);
    return { success: false, error: 'Workspace role is required when granting login access.' };
  }

  // Resolve the role FIRST so we can check seat limits before sending the Auth invite
  const { data: roleRow } = await supabase
    .schema('ops')
    .from('workspace_roles')
    .select('id, slug')
    .eq('id', workspace_role_id)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .single();

  if (!roleRow) {
    await rollbackRosterStep(supabase, orgMemberId, entityIdForRollback);
    return { success: false, error: 'Invalid workspace role.' };
  }

  // Seat limit enforcement — employee role is free and unlimited, skip the check.
  // Must run BEFORE the Auth invite so we don't send a login email to someone we can't seat.
  if (roleRow.slug !== 'employee') {
    const seatCheck = await canAddSeat(workspaceId);
    if (!seatCheck.allowed) {
      await rollbackRosterStep(supabase, orgMemberId, entityIdForRollback);
      return {
        success: false,
        error: 'seat_limit_reached',
        current: seatCheck.current,
        limit: seatCheck.limit,
      } as InviteTeamMemberResult;
    }
  }

  const system = getSystemClient();
  const { data: invitedUser, error: inviteError } = await system.auth.admin.inviteUserByEmail(
    email.trim(),
    { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/login` }
  );

  if (inviteError || !invitedUser?.user?.id) {
    await rollbackRosterStep(supabase, orgMemberId, entityIdForRollback);
    const msg = inviteError?.message ?? 'Failed to send login invite.';
    if (msg.toLowerCase().includes('already been registered') || msg.toLowerCase().includes('already exists')) {
      return { success: false, error: 'This email already has an account. Add them from Settings → Team with their existing account.' };
    }
    return { success: false, error: msg };
  }

  const invitedUserId = invitedUser.user.id;

  const legacyRole = WORKSPACE_ROLE_SLUG_TO_LEGACY[roleRow.slug] ?? 'member';

  /*
    Through the system client, because adding somebody OTHER than yourself to a
    workspace is a privileged act and the session client can no longer do it.

    `public.workspace_members` used to carry an INSERT policy of
    `WITH CHECK (user_id = auth.uid())` -- no constraint on workspace_id, none
    on role -- which let any signed-in user make themselves owner of any
    workspace. 20260910180000 removed it and revoked INSERT. This statement
    never satisfied that policy anyway (it inserts the invitee, not the caller),
    so it has been failing since the policy landed; the invite email went out
    first and `rollbackRosterStep` only warns.

    The authorisation for this write is the owner/admin check above.
  */
  // AUTHZ-OK: gated by the `user_has_workspace_role(owner, admin)` RPC at the
  // top of this action, and by `canAddSeat` on the workspace's seat limit. The
  // rule cannot see an RPC called by name rather than an imported helper.
  const { error: insertErr } = await system.from('workspace_members').insert({
    workspace_id: workspaceId,
    user_id: invitedUserId,
    role_id: workspace_role_id,
    role: legacyRole,
  });

  if (insertErr) {
    await rollbackRosterStep(supabase, orgMemberId, entityIdForRollback);
    return { success: false, error: insertErr.message ?? 'Failed to add to workspace team.' };
  }

  revalidatePath('/settings');
  revalidatePath('/settings/team');
  revalidatePath('/network');
  return {
    success: true,
    message: `Invite sent to ${email}. They have been added to the roster and will get Unusonic login access when they accept.`,
  };
}

 
async function rollbackRosterStep(
  _supabase: Awaited<ReturnType<typeof createClient>>,
  _orgMemberId: string,
  _entityId: string | null
): Promise<void> {
  // Cortex.relationships entries cannot be hard-deleted without a dedicated RPC.
  // The ghost person remains on the roster with no workspace access.
  // An admin can remove them via the offboard flow if needed.
  console.warn('[inviteTeamMember] Rollback: ghost roster entry left in cortex (no workspace access).');
}

/*
  getWorkspaceLocations and addLocation lived here, along with LocationData.

  Both queried `public.locations`, a table that does not exist -- PostgREST
  answers 404 -- so the Settings locations panel has been listing nothing and
  its add button returning an error for as long as the table has been absent.

  There is nothing to restore. A place a show happens is a `directory.entities`
  row of type 'venue', which is where the rest of the product already looks.
*/

 
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

// ============================================================================
// Types
// ============================================================================

export interface WorkspacePermissions {
  view_finance: boolean;
  view_planning: boolean;
  view_ros: boolean;
  manage_team: boolean;
  manage_locations: boolean;
}

const OWNER_PERMISSIONS: WorkspacePermissions = {
  view_finance: true,
  view_planning: true,
  view_ros: true,
  manage_team: true,
  manage_locations: true,
};

const DEFAULT_MEMBER_PERMISSIONS: WorkspacePermissions = {
  view_finance: false,
  view_planning: true,
  view_ros: true,
  manage_team: false,
  manage_locations: false,
};

export interface SetupWorkspaceResult {
  success: boolean;
  error?: string;
  workspace?: {
    id: string;
    name: string;
  };
  location?: {
    id: string;
    name: string;
  };
}

// ============================================================================
// Setup Initial Workspace
// Creates workspace, default location, and owner membership
// ============================================================================

/**
 * Sets up a complete workspace with default location and owner membership
 * 
 * This is the primary action for workspace creation - it:
 * 1. Creates a new Workspace
 * 2. Creates a default 'Main Office' location
 * 3. Assigns the creator as 'owner' with all permissions
 * 
 * @param name - The workspace name
 * @param locationName - Optional custom name for the primary location (defaults to 'Main Office')
 * @param department - Optional department for the owner (e.g., 'Executive', 'Operations')
 */
export async function setupInitialWorkspace(
  name: string,
  locationName: string = 'Main Office',
  department?: string
): Promise<SetupWorkspaceResult> {
  const supabase = await createClient();
  
  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  // Validate input
  if (!name.trim()) {
    return { success: false, error: 'Workspace name is required' };
  }
  
  try {
    // Step 1: Create the workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .insert({
        name: name.trim(),
        created_by: user.id,
      })
      .select()
      .single();
    
    if (workspaceError || !workspace) {
      console.error('[Workspace] Create error:', workspaceError);
      return { 
        success: false, 
        error: workspaceError?.message || 'Failed to create workspace' 
      };
    }
    
    // Step 2: Create the default location
    const { data: location, error: locationError } = await supabase
      .from('locations')
      .insert({
        workspace_id: workspace.id,
        name: locationName.trim(),
        is_primary: true,
      })
      .select()
      .single();
    
    if (locationError) {
      console.error('[Workspace] Location create error:', locationError);
      // Rollback workspace creation
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return { 
        success: false, 
        error: locationError.message || 'Failed to create default location' 
      };
    }
    
    // Step 3: Add the creator as owner with full permissions
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({
        workspace_id: workspace.id,
        user_id: user.id,
        role: 'owner',
        department: department?.trim() || 'Executive',
        permissions: OWNER_PERMISSIONS,
        primary_location_id: location?.id,
      });
    
    if (memberError) {
      console.error('[Workspace] Member create error:', memberError);
      // Rollback
      await supabase.from('locations').delete().eq('id', location.id);
      await supabase.from('workspaces').delete().eq('id', workspace.id);
      return { 
        success: false, 
        error: memberError.message || 'Failed to assign ownership' 
      };
    }
    
    revalidatePath('/');
    
    return {
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
      },
      location: location ? {
        id: location.id,
        name: location.name,
      } : undefined,
    };
    
  } catch (e) {
    console.error('[Workspace] Unexpected error:', e);
    return { 
      success: false, 
      error: 'An unexpected error occurred' 
    };
  }
}

// ============================================================================
// Update Member Permissions
// ============================================================================

/**
 * Updates a member's permissions in a workspace
 * Requires manage_team permission or owner/admin role
 */
export async function updateMemberPermissions(
  workspaceId: string,
  memberId: string,
  permissions: Partial<WorkspacePermissions>
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  // Check if user has permission to manage team
  const { data: currentMember } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();
  
  if (!currentMember) {
    return { success: false, error: 'Not a member of this workspace' };
  }
  
  const canManage = 
    currentMember.role === 'owner' || 
    currentMember.role === 'admin' ||
    (currentMember.permissions as WorkspacePermissions)?.manage_team;
  
  if (!canManage) {
    return { success: false, error: 'Insufficient permissions' };
  }
  
  // Get target member's current permissions
  const { data: targetMember } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)
    .single();
  
  if (!targetMember) {
    return { success: false, error: 'Member not found' };
  }
  
  // Prevent modifying owner permissions (unless you're the owner)
  if (targetMember.role === 'owner' && currentMember.role !== 'owner') {
    return { success: false, error: 'Cannot modify owner permissions' };
  }
  
  // Merge permissions
  const updatedPermissions = {
    ...(targetMember.permissions as WorkspacePermissions),
    ...permissions,
  };
  
  const { error } = await supabase
    .from('workspace_members')
    .update({ permissions: updatedPermissions })
    .eq('id', memberId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/settings');
  return { success: true };
}

// ============================================================================
// Update Member Department
// ============================================================================

/**
 * Updates a member's department
 * Requires manage_team permission or owner/admin role
 */
export async function updateMemberDepartment(
  workspaceId: string,
  memberId: string,
  department: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  // Check if user has permission to manage team
  const { data: currentMember } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();
  
  if (!currentMember) {
    return { success: false, error: 'Not a member of this workspace' };
  }
  
  const canManage = 
    currentMember.role === 'owner' || 
    currentMember.role === 'admin' ||
    (currentMember.permissions as WorkspacePermissions)?.manage_team;
  
  if (!canManage) {
    return { success: false, error: 'Insufficient permissions' };
  }
  
  const { error } = await supabase
    .from('workspace_members')
    .update({ department: department.trim() })
    .eq('id', memberId)
    .eq('workspace_id', workspaceId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/settings');
  return { success: true };
}


// ============================================================================
// Get Workspace Members
// ============================================================================

export interface WorkspaceMemberData {
  id: string;
  userId: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  /** Legacy text role (owner | admin | member | viewer) for display/fallback. */
  role: 'owner' | 'admin' | 'member' | 'viewer';
  /** Resolved role from workspace_roles when role_id is set. */
  roleId: string | null;
  roleName: string | null;
  department: string | null;
  permissions: WorkspacePermissions;
  primaryLocationId: string | null;
  joinedAt: string;
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
      id,
      user_id,
      role,
      role_id,
      department,
      permissions,
      primary_location_id,
      created_at,
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
    .order('role')
    .order('created_at', { ascending: true });

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
      id: m.id,
      userId: m.user_id,
      email: profile?.email || '',
      fullName: profile?.full_name || null,
      avatarUrl: profile?.avatar_url || null,
      role: m.role as 'owner' | 'admin' | 'member' | 'viewer',
      roleId: m.role_id ?? null,
      roleName,
      department: m.department,
      permissions: m.permissions as WorkspacePermissions,
      primaryLocationId: m.primary_location_id,
      joinedAt: m.created_at,
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

  const { data: currentMember } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  const canManage =
    currentMember?.role === 'owner' ||
    currentMember?.role === 'admin' ||
    (currentMember?.permissions as WorkspacePermissions)?.manage_team;
  if (!currentMember || !canManage) {
    return { success: false, error: 'You do not have permission to offboard members in this workspace.' };
  }

  if (targetUserId === user.id) {
    return { success: false, error: 'You cannot offboard yourself. Ask another owner or admin to remove you.' };
  }

  const { data: targetRow } = await supabase
    .from('workspace_members')
    .select('id, role')
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
      .select('id', { count: 'exact', head: true })
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
  const { error: deleteWmErr } = await supabase
    .from('workspace_members')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', targetUserId);

  if (deleteWmErr) {
    return { success: false, error: deleteWmErr.message ?? 'Failed to revoke access.' };
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

  const { data: currentMember } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  const canManage =
    currentMember?.role === 'owner' ||
    currentMember?.role === 'admin' ||
    (currentMember?.permissions as WorkspacePermissions)?.manage_team;
  if (!currentMember || !canManage) {
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
    p_job_title: job_title?.trim() || null,
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

  const { error: insertErr } = await supabase.from('workspace_members').insert({
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

// ============================================================================
// Get Workspace Locations
// ============================================================================

export interface LocationData {
  id: string;
  name: string;
  address: string | null;
  isPrimary: boolean;
}

/**
 * Fetches all locations for a workspace
 */
export async function getWorkspaceLocations(
  workspaceId: string
): Promise<{ success: boolean; locations?: LocationData[]; error?: string }> {
  const supabase = await createClient();
  
  const { data: locations, error } = await supabase
    .from('locations')
    .select('id, name, address, is_primary')
    .eq('workspace_id', workspaceId)
    .order('is_primary', { ascending: false })
    .order('name');
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  const formattedLocations: LocationData[] = locations.map((l) => ({
    id: l.id,
    name: l.name,
    address: l.address,
    isPrimary: l.is_primary,
  }));
  
  return { success: true, locations: formattedLocations };
}

// ============================================================================
// Add Location
// ============================================================================

/**
 * Adds a new location to the workspace
 */
export async function addLocation(
  workspaceId: string,
  name: string,
  address?: string
): Promise<{ success: boolean; location?: LocationData; error?: string }> {
  const supabase = await createClient();
  
  const { data: location, error } = await supabase
    .from('locations')
    .insert({
      workspace_id: workspaceId,
      name: name.trim(),
      address: address?.trim() || null,
      is_primary: false,
    })
    .select()
    .single();
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/settings');
  
  return {
    success: true,
    location: {
      id: location.id,
      name: location.name,
      address: location.address,
      isPrimary: location.is_primary,
    },
  };
}

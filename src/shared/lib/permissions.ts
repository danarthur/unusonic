/**
 * Permission Utilities
 * Centralized permission checking for Unusonic.
 * Capabilities-based path: use hasCapability(workspaceId, capabilityKey) and the
 * Permission Registry (permission-registry.ts). Legacy path: hasPermission(..., PermissionKey).
 *
 * Future: Auth Hooks can inject permission_bundle into JWT app_metadata so RLS
 * can check without a DB read per row — see docs/reference/permissions/capabilities-based-roles-and-role-builder.md §4.4.
 * @module lib/permissions
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import type { CapabilityKey } from '@/shared/lib/permission-registry';

// ============================================================================
// Types
// ============================================================================

export type PermissionKey =
  | 'view_finance'
  | 'view_planning'
  | 'view_ros'
  | 'manage_team'
  | 'manage_locations';

export interface WorkspacePermissions {
  view_finance: boolean;
  view_planning: boolean;
  view_ros: boolean;
  manage_team: boolean;
  manage_locations: boolean;
}

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer' | 'employee';

// Re-export for callers that want the new capability type
export type { CapabilityKey } from '@/shared/lib/permission-registry';

// Employee role slug — used for portal routing checks
const EMPLOYEE_ROLE_SLUG = 'employee';

// ============================================================================
// Capability check (unified path: role_id → permission_bundle)
// ============================================================================

/**
 * Checks if the current user (or given user) has a specific capability in the workspace.
 * Uses the member_has_capability RPC: resolves workspace_members.role_id → workspace_roles.permission_bundle,
 * or falls back to legacy role text when role_id is not yet set.
 *
 * @param userId - Optional; defaults to current auth user.
 * @param workspaceId - Workspace to check.
 * @param capabilityKey - Atomic permission key (e.g. 'finance:view', 'deals:read:global'). Use keys from permission-registry.
 * @returns true if the user has the capability.
 */
export async function hasCapability(
  userId: string | null,
  workspaceId: string,
  capabilityKey: CapabilityKey
): Promise<boolean> {
  const supabase = await createClient();
  const effectiveUserId = userId || (await supabase.auth.getUser()).data.user?.id;
  if (!effectiveUserId) return false;

  /*
    `member_has_capability` reads auth.uid(), so it can only answer for the
    caller. Asking about somebody else returns false.

    This used to fall back to `hasPermission`, which read a
    `workspace_members.permissions` column that does not exist -- so the
    fallback returned false too, by way of a 400 rather than a decision.
    Returning false directly is the same answer without the round trip, and it
    is honest about the limit: what this needs is an RPC taking p_user_id.
  */
  const { data: { user } } = await supabase.auth.getUser();
  if (user && userId && user.id !== userId) {
    return false;
  }

  const { data, error } = await supabase.rpc('member_has_capability', {
    p_workspace_id: workspaceId,
    p_permission_key: capabilityKey,
  });
  if (error) return false;
  return data === true;
}

/*
  hasPermission and hasPermissions lived here and are gone.

  Both selected `role, permissions` from `public.workspace_members`. There is no
  `permissions` column -- capabilities moved onto the member's role -- so the
  query returned a 400, the `if (error) return false` fired, and both functions
  denied everyone, workspace owners included. They had no callers, which is the
  only reason nothing broke.

  `hasCapability` above is the live path: role_id -> ops.workspace_roles ->
  ops.workspace_role_permissions, through `member_has_capability`.

  The PermissionKey / WorkspacePermissions types stay for
  `capabilityToLegacyPermission`, which maps a capability back to a legacy key
  for the one place that still needs it.
*/

// ============================================================================
// Role Check
// ============================================================================

/**
 * Gets the user's role in a workspace
 * 
 * @param userId - The user ID to check
 * @param workspaceId - The workspace ID
 * @returns The role or null if not a member
 */
export async function getUserRole(
  userId: string | null,
  workspaceId: string
): Promise<WorkspaceRole | null> {
  const supabase = await createClient();
  
  const effectiveUserId = userId || (await supabase.auth.getUser()).data.user?.id;
  
  if (!effectiveUserId) {
    return null;
  }
  
  const { data: member, error } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', effectiveUserId)
    .single();
  
  if (error || !member) {
    return null;
  }
  
  return member.role as WorkspaceRole;
}

// ============================================================================
// Role Slug Resolution (for middleware routing)
// ============================================================================

/**
 * Returns the role slug for the current user in a workspace via the
 * get_member_role_slug RPC. Used by middleware and layout for role-based routing.
 */
export async function getUserRoleSlug(
  workspaceId: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_member_role_slug', {
    p_workspace_id: workspaceId,
  });
  if (error || !data) return null;
  return data as string;
}

/**
 * Returns true if the current user has the employee role in the given workspace.
 */
export async function isEmployee(workspaceId: string): Promise<boolean> {
  const slug = await getUserRoleSlug(workspaceId);
  return slug === EMPLOYEE_ROLE_SLUG;
}

// ============================================================================
// Convenience Methods
// ============================================================================

/*
  canViewFinance, canViewPlanning, canViewROS, canManageTeam and
  canManageLocations were one-line wrappers around hasPermission, and had no
  callers. They go with it. Ask `hasCapability(userId, workspaceId, key)` with a
  key from the permission registry.
*/

// ============================================================================
// Deal stakeholder overrides (contextual access)
// ============================================================================

/**
 * Two-step check for access to a deal's financial context (invoices, proposal, payments).
 * Step 1: User has workspace capability `finance:view` (global).
 * Step 2: If not, check if the current user's entity is a stakeholder (bill_to, planner, etc.) on this deal;
 *   if yes, grant contextual access to that deal's financial data.
 * Use in deal-scoped and event→deal finance routes/actions.
 */
export async function canAccessDealFinancials(
  workspaceId: string,
  dealId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const hasGlobal = await hasCapability(user.id, workspaceId, 'finance:view');
  if (hasGlobal) return true;

  const { data: dirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!dirEnt?.id) return false;

  const { data: stake, error } = await supabase
    .schema('ops')
    .from('deal_stakeholders')
    .select('id')
    .eq('deal_id', dealId)
    .eq('entity_id', dirEnt.id)
    .limit(1)
    .maybeSingle();

  return !error && !!stake;
}

/**
 * Two-step check for access to a deal's proposals (view/send context).
 * Step 1: hasCapability(workspaceId, 'proposals:view'). Step 2: if not, allow if current user's entity is a stakeholder on this deal.
 */
export async function canAccessDealProposals(
  workspaceId: string,
  dealId: string
): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  const hasGlobal = await hasCapability(user.id, workspaceId, 'proposals:view');
  if (hasGlobal) return true;

  const { data: dirEnt } = await supabase
    .schema('directory').from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  if (!dirEnt?.id) return false;

  const { data: stake, error } = await supabase
    .schema('ops')
    .from('deal_stakeholders')
    .select('id')
    .eq('deal_id', dealId)
    .eq('entity_id', dirEnt.id)
    .limit(1)
    .maybeSingle();

  return !error && !!stake;
}

// ============================================================================
// Guard Functions (for use in Server Components/Actions)
// ============================================================================

/*
  requirePermission threw when hasPermission said no. Same story: no callers,
  and the check underneath it could not succeed. Guard with `hasCapability`.
*/

/**
 * Throws an error if user isn't at least the specified role
 * 
 * @throws Error if insufficient role
 */
export async function requireRole(
  userId: string | null,
  workspaceId: string,
  minimumRole: WorkspaceRole,
  errorMessage: string = 'Insufficient role'
): Promise<void> {
  const role = await getUserRole(userId, workspaceId);
  
  if (!role) {
    throw new Error('Not a workspace member');
  }
  
  const roleHierarchy: WorkspaceRole[] = ['owner', 'admin', 'member', 'viewer', 'employee'];
  const userRoleIndex = roleHierarchy.indexOf(role);
  const requiredRoleIndex = roleHierarchy.indexOf(minimumRole);
  
  if (userRoleIndex > requiredRoleIndex) {
    throw new Error(errorMessage);
  }
}

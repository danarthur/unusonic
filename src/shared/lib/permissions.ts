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
import { capabilityToLegacyPermission } from '@/shared/lib/permission-registry';

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

// Owner and admin have all permissions by default
const ELEVATED_ROLES: WorkspaceRole[] = ['owner', 'admin'];

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

  // RPC uses auth.uid() for the check; if we're checking another user we must use a different path.
  // For now, member_has_capability only supports "current user". So if userId is provided and different from current user,
  // fall back to legacy hasPermission for that user (or we'd need an RPC that accepts p_user_id).
  const { data: { user } } = await supabase.auth.getUser();
  if (user && userId && user.id !== userId) {
    // Caller asked for a different user; RPC uses auth.uid(). Use legacy path if this capability maps to a legacy key.
    const legacyKey = capabilityToLegacyPermission(capabilityKey);
    if (legacyKey) return hasPermission(userId, workspaceId, legacyKey as PermissionKey);
    return false;
  }

  const { data, error } = await supabase.rpc('member_has_capability', {
    p_workspace_id: workspaceId,
    p_permission_key: capabilityKey,
  });
  if (error) return false;
  return data === true;
}

// ============================================================================
// Core Permission Check (legacy keys; can delegate to hasCapability when mapped)
// ============================================================================

/**
 * Checks if a user has a specific permission in a workspace
 * 
 * Uses the database function `member_has_permission` which:
 * - Returns TRUE for owners (all permissions)
 * - Returns TRUE for admins (most permissions)
 * - Checks JSONB permissions for members/viewers
 * 
 * @param userId - The user ID to check (optional, defaults to current user)
 * @param workspaceId - The workspace ID
 * @param permissionKey - The permission to check
 * @returns boolean indicating if user has permission
 * 
 * @example
 * const canViewFinance = await hasPermission(userId, workspaceId, 'view_finance');
 * if (!canViewFinance) {
 *   redirect('/unauthorized');
 * }
 */
export async function hasPermission(
  userId: string | null,
  workspaceId: string,
  permissionKey: PermissionKey
): Promise<boolean> {
  const supabase = await createClient();
  
  // If no userId provided, use current authenticated user
  const effectiveUserId = userId || (await supabase.auth.getUser()).data.user?.id;
  
  if (!effectiveUserId) {
    return false;
  }
  
  // Query the workspace membership and check permissions
  const { data: member, error } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', effectiveUserId)
    .single();
  
  if (error || !member) {
    return false;
  }
  
  // Owners and admins have all permissions
  if (ELEVATED_ROLES.includes(member.role as WorkspaceRole)) {
    return true;
  }
  
  // Check JSONB permissions for regular members
  const permissions = member.permissions as WorkspacePermissions | null;
  return permissions?.[permissionKey] ?? false;
}

// ============================================================================
// Batch Permission Check
// ============================================================================

/**
 * Checks multiple permissions at once for efficiency
 * 
 * @param userId - The user ID to check
 * @param workspaceId - The workspace ID
 * @param permissionKeys - Array of permissions to check
 * @returns Object with permission keys as keys and booleans as values
 * 
 * @example
 * const perms = await hasPermissions(userId, workspaceId, ['view_finance', 'manage_team']);
 * // { view_finance: true, manage_team: false }
 */
export async function hasPermissions(
  userId: string | null,
  workspaceId: string,
  permissionKeys: PermissionKey[]
): Promise<Record<PermissionKey, boolean>> {
  const supabase = await createClient();
  
  const effectiveUserId = userId || (await supabase.auth.getUser()).data.user?.id;
  
  // Default all to false
  const result: Record<PermissionKey, boolean> = {
    view_finance: false,
    view_planning: false,
    view_ros: false,
    manage_team: false,
    manage_locations: false,
  };
  
  if (!effectiveUserId) {
    return result;
  }
  
  const { data: member, error } = await supabase
    .from('workspace_members')
    .select('role, permissions')
    .eq('workspace_id', workspaceId)
    .eq('user_id', effectiveUserId)
    .single();
  
  if (error || !member) {
    return result;
  }
  
  const isElevated = ELEVATED_ROLES.includes(member.role as WorkspaceRole);
  const permissions = member.permissions as WorkspacePermissions | null;
  
  for (const key of permissionKeys) {
    result[key] = isElevated || (permissions?.[key] ?? false);
  }
  
  return result;
}

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

/**
 * Checks if user can view finance data
 */
export async function canViewFinance(
  userId: string | null,
  workspaceId: string
): Promise<boolean> {
  return hasPermission(userId, workspaceId, 'view_finance');
}

/**
 * Checks if user can view planning data
 */
export async function canViewPlanning(
  userId: string | null,
  workspaceId: string
): Promise<boolean> {
  return hasPermission(userId, workspaceId, 'view_planning');
}

/**
 * Checks if user can view run-of-show data
 */
export async function canViewROS(
  userId: string | null,
  workspaceId: string
): Promise<boolean> {
  return hasPermission(userId, workspaceId, 'view_ros');
}

/**
 * Checks if user can manage team members
 */
export async function canManageTeam(
  userId: string | null,
  workspaceId: string
): Promise<boolean> {
  return hasPermission(userId, workspaceId, 'manage_team');
}

/**
 * Checks if user can manage locations
 */
export async function canManageLocations(
  userId: string | null,
  workspaceId: string
): Promise<boolean> {
  return hasPermission(userId, workspaceId, 'manage_locations');
}

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

/**
 * Throws an error if user doesn't have permission
 * Use in server actions to protect endpoints
 * 
 * @throws Error if permission denied
 */
export async function requirePermission(
  userId: string | null,
  workspaceId: string,
  permissionKey: PermissionKey,
  errorMessage: string = 'Permission denied'
): Promise<void> {
  const allowed = await hasPermission(userId, workspaceId, permissionKey);
  
  if (!allowed) {
    throw new Error(errorMessage);
  }
}

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

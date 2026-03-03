'use server';

/**
 * Role Builder: fetch system + custom roles with permission keys; create/update/delete custom roles.
 * All operations are workspace-scoped and respect RLS.
 * Custom role create/update/delete are gated by subscription_tier (venue_os or autonomous).
 */

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import type { CapabilityKey } from '@/shared/lib/permission-registry';
import type { PermissionScope } from '../model/permission-metadata';

const ROLE_BUILDER_TIERS = ['venue_os', 'autonomous'] as const;

async function getWorkspaceSubscriptionTier(workspaceId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('workspaces')
    .select('subscription_tier')
    .eq('id', workspaceId)
    .single();
  return data?.subscription_tier ?? null;
}

function canUseRoleBuilder(tier: string | null): boolean {
  return tier != null && ROLE_BUILDER_TIERS.includes(tier as (typeof ROLE_BUILDER_TIERS)[number]);
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
  workspace_id: string | null;
  permissionKeys: CapabilityKey[];
}

/** Supabase can return workspace_permissions as single object or array depending on relation. */
type NestedPermission = {
  workspace_permissions: { key: string } | { key: string }[] | null;
};
type RoleRow = {
  id: string;
  name: string;
  slug: string;
  is_system: boolean;
  workspace_id: string | null;
  workspace_role_permissions?: NestedPermission[];
};

/**
 * Fetches system roles (workspace_id IS NULL) and the workspace's custom roles with permission keys.
 */
export async function getWorkspaceRolesForBuilder(
  workspaceId: string
): Promise<{ success: boolean; systemRoles?: RoleWithPermissions[]; customRoles?: RoleWithPermissions[]; error?: string }> {
  const supabase = await createClient();

  const { data: roles, error } = await supabase
    .schema('ops')
    .from('workspace_roles')
    .select('id, name, slug, is_system, workspace_id, workspace_role_permissions(workspace_permissions(key))')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('is_system', { ascending: false })
    .order('slug');

  if (error) {
    return { success: false, error: error.message };
  }

  const mapRow = (r: RoleRow): RoleWithPermissions => {
    const rps = r.workspace_role_permissions ?? [];
    const permissionKeys = rps
      .flatMap((rp) => {
        const p = rp.workspace_permissions;
        if (!p) return [];
        return Array.isArray(p) ? p.map((x) => x.key) : [p.key];
      })
      .filter((k): k is string => !!k) as CapabilityKey[];
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      is_system: r.is_system,
      workspace_id: r.workspace_id,
      permissionKeys,
    };
  };

  const systemRoles = (roles ?? []).filter((r) => r.workspace_id == null).map(mapRow);
  const customRoles = (roles ?? []).filter((r) => r.workspace_id === workspaceId).map(mapRow);

  return { success: true, systemRoles, customRoles };
}

export interface CreateCustomRolePayload {
  name: string;
  slug: string;
  permissionKeys: string[];
  scopes?: Record<string, PermissionScope>;
}

/**
 * Creates a custom role and its permission links. Caller must have workspace:roles:manage (or owner/admin).
 * Rejected if workspace subscription_tier is not venue_os or autonomous.
 */
export async function createCustomRole(
  workspaceId: string,
  payload: CreateCustomRolePayload
): Promise<{ success: boolean; roleId?: string; error?: string }> {
  const tier = await getWorkspaceSubscriptionTier(workspaceId);
  if (!canUseRoleBuilder(tier)) {
    return { success: false, error: 'Custom roles require Venue OS or Autonomous plan.' };
  }

  const supabase = await createClient();

  const { data: role, error: roleError } = await supabase
    .schema('ops')
    .from('workspace_roles')
    .insert({
      name: payload.name,
      slug: payload.slug,
      is_system: false,
      workspace_id: workspaceId,
    })
    .select('id')
    .single();

  if (roleError || !role) {
    return { success: false, error: roleError?.message ?? 'Failed to create role' };
  }

  if (payload.permissionKeys.length > 0) {
    const { data: perms } = await supabase.schema('ops').from('workspace_permissions').select('id, key').in('key', payload.permissionKeys);
    const permissionIds = (perms ?? []).map((p) => p.id);
    if (permissionIds.length > 0) {
      await supabase.schema('ops').from('workspace_role_permissions').insert(
        permissionIds.map((permission_id) => ({ role_id: role.id, permission_id }))
      );
    }
  }

  revalidatePath('/settings');
  return { success: true, roleId: role.id };
}

export interface UpdateCustomRolePayload {
  name?: string;
  slug?: string;
  permissionKeys?: string[];
  scopes?: Record<string, PermissionScope>;
}

/**
 * Updates a custom role (name/slug and replaces permission set). Role must belong to workspace and not be system.
 * Rejected if workspace subscription_tier is not venue_os or autonomous.
 */
export async function updateCustomRole(
  roleId: string,
  workspaceId: string,
  payload: UpdateCustomRolePayload
): Promise<{ success: boolean; error?: string }> {
  const tier = await getWorkspaceSubscriptionTier(workspaceId);
  if (!canUseRoleBuilder(tier)) {
    return { success: false, error: 'Custom roles require Venue OS or Autonomous plan.' };
  }

  const supabase = await createClient();

  const updates: { name?: string; slug?: string } = {};
  if (payload.name != null) updates.name = payload.name;
  if (payload.slug != null) updates.slug = payload.slug;

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .schema('ops')
      .from('workspace_roles')
      .update(updates)
      .eq('id', roleId)
      .eq('workspace_id', workspaceId)
      .eq('is_system', false);
    if (updateError) return { success: false, error: updateError.message };
  }

  if (payload.permissionKeys != null) {
    await supabase.schema('ops').from('workspace_role_permissions').delete().eq('role_id', roleId);
    if (payload.permissionKeys.length > 0) {
      const { data: perms } = await supabase.schema('ops').from('workspace_permissions').select('id, key').in('key', payload.permissionKeys);
      const permissionIds = (perms ?? []).map((p) => p.id);
      if (permissionIds.length > 0) {
        await supabase.schema('ops').from('workspace_role_permissions').insert(
          permissionIds.map((permission_id) => ({ role_id: roleId, permission_id }))
        );
      }
    }
  }

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Updates a member's workspace role (role_id). Requires manage_team or owner/admin.
 * Cannot change the owner's role. roleId must be a system role or a custom role for this workspace.
 */
export async function updateMemberRole(
  workspaceId: string,
  memberId: string,
  roleId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

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
    (currentMember.permissions as { manage_team?: boolean } | null)?.manage_team;

  if (!canManage) {
    return { success: false, error: 'Insufficient permissions' };
  }

  const { data: targetMember } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('id', memberId)
    .eq('workspace_id', workspaceId)
    .single();

  if (!targetMember) {
    return { success: false, error: 'Member not found' };
  }

  if (targetMember.role === 'owner') {
    const { count, error: countErr } = await supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('role', 'owner');
    if (countErr || (count ?? 0) <= 1) {
      return { success: false, error: 'Cannot remove the last Owner. Assign another member as Owner first.' };
    }
  }

  const { data: roleRow } = await supabase
    .schema('ops')
    .from('workspace_roles')
    .select('id, slug')
    .eq('id', roleId)
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .single();

  if (!roleRow) {
    return { success: false, error: 'Invalid role' };
  }

  const systemSlugToLegacy: Record<string, 'owner' | 'admin' | 'member' | 'viewer'> = {
    owner: 'owner',
    admin: 'admin',
    member: 'member',
    observer: 'viewer',
  };
  const legacyRole = systemSlugToLegacy[roleRow.slug] ?? 'member';
  const { error } = await supabase
    .from('workspace_members')
    .update({ role_id: roleId, role: legacyRole })
    .eq('id', memberId)
    .eq('workspace_id', workspaceId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath('/settings');
  return { success: true };
}

/**
 * Deletes a custom role. Fails with ROLE_IN_USE if any workspace_members have this role_id
 * (caller must reassign those members first).
 * Rejected if workspace subscription_tier is not venue_os or autonomous.
 */
export async function deleteCustomRole(
  roleId: string,
  workspaceId: string
): Promise<{ success: boolean; error?: string; code?: string }> {
  const tier = await getWorkspaceSubscriptionTier(workspaceId);
  if (!canUseRoleBuilder(tier)) {
    return { success: false, error: 'Custom roles require Venue OS or Autonomous plan.' };
  }

  const supabase = await createClient();

  const { data: role } = await supabase
    .schema('ops')
    .from('workspace_roles')
    .select('id, is_system, workspace_id')
    .eq('id', roleId)
    .single();

  if (!role || role.is_system || role.workspace_id !== workspaceId) {
    return { success: false, error: 'Role not found or not a custom role.' };
  }

  const { count, error: countErr } = await supabase
    .from('workspace_members')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId);

  if (countErr) return { success: false, error: countErr.message };
  if ((count ?? 0) > 0) {
    return {
      success: false,
      error: `${count} user(s) have this role. Reassign them to another role before deleting.`,
      code: 'ROLE_IN_USE',
    };
  }

  await supabase.schema('ops').from('workspace_role_permissions').delete().eq('role_id', roleId);
  const { error: deleteErr } = await supabase
    .schema('ops')
    .from('workspace_roles')
    .delete()
    .eq('id', roleId)
    .eq('workspace_id', workspaceId);

  if (deleteErr) return { success: false, error: deleteErr.message };
  revalidatePath('/settings');
  return { success: true };
}

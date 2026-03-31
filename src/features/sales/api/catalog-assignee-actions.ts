'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type CatalogAssigneeRow = {
  id: string;
  package_id: string;
  /** null for role-only rows (e.g. "DJ" type without a named person) */
  entity_id: string | null;
  role_note: string | null;
  created_at: string;
  entity_name: string | null;
  entity_type: string | null;
};

// =============================================================================
// getCatalogItemAssignees
// =============================================================================

export async function getCatalogItemAssignees(packageId: string): Promise<CatalogAssigneeRow[]> {
  const parsed = z.string().uuid().safeParse(packageId);
  if (!parsed.success) return [];

  try {
    const supabase = await createClient();

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return [];

    // Verify package belongs to workspace
    const { data: pkg } = await supabase
      .from('packages')
      .select('id')
      .eq('id', packageId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!pkg) return [];

    const { data: rows, error } = await supabase.rpc('get_catalog_item_assignees', {
      p_package_id: packageId,
    });

    if (error || !rows?.length) return [];

    type RawRow = { id: string; package_id: string; entity_id: string | null; role_note: string | null; created_at: string };

    // Batch-resolve entity names for rows that have an entity_id
    const entityIds = (rows as RawRow[]).map((r) => r.entity_id).filter((id): id is string => id != null);
    let entityMap = new Map<string, { name: string; type: string }>();
    if (entityIds.length > 0) {
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name, type')
        .in('id', entityIds);
      entityMap = new Map(
        (entities ?? []).map((e) => [e.id, { name: e.display_name ?? '', type: (e as { type?: string }).type ?? '' }])
      );
    }

    return (rows as RawRow[]).map((r) => ({
      id: r.id,
      package_id: r.package_id,
      entity_id: r.entity_id,
      role_note: r.role_note,
      created_at: r.created_at,
      entity_name: r.entity_id ? (entityMap.get(r.entity_id)?.name ?? null) : null,
      entity_type: r.entity_id ? (entityMap.get(r.entity_id)?.type ?? null) : null,
    }));
  } catch {
    return [];
  }
}

// =============================================================================
// addCatalogItemAssignee — named person
// =============================================================================

const AddAssigneeSchema = z.object({
  packageId: z.string().uuid(),
  entityId: z.string().uuid(),
  roleNote: z.string().max(120).optional(),
});

export async function addCatalogItemAssignee(
  packageId: string,
  entityId: string,
  roleNote?: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const parsed = AddAssigneeSchema.safeParse({ packageId, entityId, roleNote });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('add_catalog_item_assignee', {
      p_package_id: packageId,
      p_entity_id: entityId,
      p_role_note: roleNote ?? null,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, id: data as string };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// addCatalogRoleAssignee — role-only (no named person, e.g. "DJ")
// =============================================================================

const AddRoleAssigneeSchema = z.object({
  packageId: z.string().uuid(),
  roleNote: z.string().min(1).max(120),
});

export async function addCatalogRoleAssignee(
  packageId: string,
  roleNote: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const parsed = AddRoleAssigneeSchema.safeParse({ packageId, roleNote });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('add_catalog_role_assignee', {
      p_package_id: packageId,
      p_role_note: roleNote,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, id: data as string };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// =============================================================================
// removeCatalogItemAssignee
// =============================================================================

export async function removeCatalogItemAssignee(
  assigneeRowId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.string().uuid().safeParse(assigneeRowId);
  if (!parsed.success) return { success: false, error: 'Invalid ID' };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc('remove_catalog_item_assignee', {
      p_assignee_id: assigneeRowId,
    });

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

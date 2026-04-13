'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type WorkspaceMemberOption = {
  entity_id: string;
  display_name: string;
  avatar_url: string | null;
  is_sales: boolean;
};

/**
 * Lists workspace team members eligible to own a deal.
 * Finds person entities that have ROSTER_MEMBER edges to any company entity
 * owned by this workspace, then tags those with the "Sales" capability.
 */
export async function getWorkspaceMembersForPicker(): Promise<WorkspaceMemberOption[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Find all company entities owned by this workspace (potential ROSTER_MEMBER targets)
  const { data: orgEntities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('owner_workspace_id', workspaceId)
    .eq('type', 'company');

  const orgEntityIds = (orgEntities ?? []).map((e) => e.id);
  if (!orgEntityIds.length) return [];

  // ROSTER_MEMBER edges: source=person, target=org
  const { data: edges } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, context_data')
    .in('target_entity_id', orgEntityIds)
    .eq('relationship_type', 'ROSTER_MEMBER');

  // Filter out soft-deleted edges (deleted_at lives in context_data)
  const activeEdges = (edges ?? []).filter((e) => {
    const ctx = e.context_data as Record<string, unknown> | null;
    return ctx?.deleted_at == null;
  });

  const teamEntityIds = [...new Set(activeEdges.map((e) => e.source_entity_id))];
  if (!teamEntityIds.length) return [];

  // Fetch entity details for team members
  const { data: entities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, avatar_url, attributes, claimed_by_user_id')
    .in('id', teamEntityIds)
    .eq('type', 'person');

  if (!entities?.length) return [];

  const allEntityIds = entities.map((e) => e.id);

  // Query Sales capability
  const salesEntityIds = new Set<string>();
  if (allEntityIds.length > 0) {
    const { data: caps } = await supabase
      .schema('ops')
      .from('entity_capabilities')
      .select('entity_id')
      .in('entity_id', allEntityIds)
      .eq('workspace_id', workspaceId)
      .eq('capability', 'Sales');
    for (const c of (caps ?? []) as { entity_id: string }[]) {
      salesEntityIds.add(c.entity_id);
    }
  }

  // Check who is an owner/admin via workspace_members → claimed_by_user_id
  const { data: members } = await supabase
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)
    .in('role', ['owner', 'admin']);

  const adminUserIds = new Set((members ?? []).map((m) => m.user_id));

  // Build roster with is_sales flag
  return entities.map((e) => {
    const attrs = (e.attributes as Record<string, unknown>) ?? {};
    const display =
      e.display_name ||
      [(attrs.first_name as string) ?? '', (attrs.last_name as string) ?? ''].filter(Boolean).join(' ').trim() ||
      e.id.slice(0, 8);
    const hasSalesCap = salesEntityIds.has(e.id);
    const isAdmin = !!e.claimed_by_user_id && adminUserIds.has(e.claimed_by_user_id);
    return {
      entity_id: e.id,
      display_name: display,
      avatar_url: e.avatar_url,
      is_sales: hasSalesCap || isAdmin,
    };
  });
}

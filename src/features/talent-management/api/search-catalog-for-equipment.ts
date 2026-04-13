'use server';

import 'server-only';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type CatalogEquipmentMatch = {
  id: string;
  name: string;
  category: string | null;
};

const SearchSchema = z.object({
  query: z.string().min(1).max(200),
});

/**
 * Search the workspace's catalog (public.packages) for equipment matching a text query.
 * Used by CrewKitSection's typeahead for catalog-linked equipment entry.
 * Only returns active rental/package items — not talent or fee items.
 */
export async function searchCatalogForEquipment(
  query: string,
): Promise<CatalogEquipmentMatch[]> {
  const parsed = SearchSchema.safeParse({ query });
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('packages')
    .select('id, name, category')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .in('category', ['rental', 'package'])
    .ilike('name', `%${parsed.data.query.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`)
    .order('name')
    .limit(10);

  if (error) return [];

  return (data ?? []).map((r: { id: string; name: string; category: string | null }) => ({
    id: r.id,
    name: r.name,
    category: r.category,
  }));
}

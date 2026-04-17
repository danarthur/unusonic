/**
 * searchReassignTargets — fuzzy entity lookup for the capture reassign picker.
 *
 * Simpler than searchReferrerEntities (which is deal-referrer specific): we
 * want a broad search across person/company/venue entities in the workspace
 * by display_name. Used only by the CaptureTimelinePanel reassign dialog.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type ReassignTarget = {
  id: string;
  name: string;
  type: 'person' | 'company' | 'venue' | 'couple' | null;
};

export async function searchReassignTargets(
  workspaceId: string,
  query: string,
): Promise<ReassignTarget[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, type')
    .eq('owner_workspace_id', workspaceId)
    .ilike('display_name', `%${q}%`)
    .not('display_name', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(20);

  return ((data ?? []) as { id: string; display_name: string | null; type: string | null }[])
    .filter((r): r is { id: string; display_name: string; type: string | null } =>
      Boolean(r.display_name),
    )
    .map((r) => ({
      id: r.id,
      name: r.display_name,
      type: (r.type as ReassignTarget['type']) ?? null,
    }));
}

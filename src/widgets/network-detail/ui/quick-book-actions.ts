'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type BookableDeal = {
  id: string;
  title: string;
  proposed_date: string | null;
};

/**
 * Returns a lightweight list of active (non-archived, non-lost) deals
 * in the current workspace — just enough for the quick-book picker.
 */
export async function getActiveDealsForBooking(): Promise<BookableDeal[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('deals')
    .select('id, title, proposed_date')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .not('status', 'eq', 'lost')
    .order('proposed_date', { ascending: true });

  if (error || !data) return [];

  return data.map((d) => ({
    id: d.id as string,
    title: (d.title as string) ?? 'Untitled deal',
    proposed_date: d.proposed_date ? String(d.proposed_date) : null,
  }));
}

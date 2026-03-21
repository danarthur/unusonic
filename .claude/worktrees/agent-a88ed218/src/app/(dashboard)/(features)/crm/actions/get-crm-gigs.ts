'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { StreamCardItem } from '../components/stream-card';

/**
 * Fetches the same deals + events the CRM page uses.
 * Used by the client shell so the list is not tied to RSC payloads (avoids list disappearing on tab switch / refetch).
 */
export async function getCrmGigs(): Promise<StreamCardItem[]> {
  const supabase = await createClient();
  const workspaceId = await getActiveWorkspaceId();

  const [dealsRes, eventsRes] = await Promise.all([
    workspaceId
      ? supabase
          .from('deals')
          .select('id, title, status, proposed_date')
          .eq('workspace_id', workspaceId)
          .order('proposed_date', { ascending: true })
      : { data: [] as Record<string, unknown>[] },
    workspaceId
      ? supabase
          .schema('ops')
          .from('events')
          .select('id, name, start_at, project:projects!inner(workspace_id)')
          .eq('projects.workspace_id', workspaceId)
          .order('start_at', { ascending: true })
      : { data: [] as Record<string, unknown>[] },
  ]);

  const dealGigs: StreamCardItem[] = (dealsRes.data ?? []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    title: (d.title as string) ?? null,
    status: (d.status as string) ?? null,
    event_date: d.proposed_date ? String(d.proposed_date) : null,
    location: null,
    client_name: null,
    source: 'deal' as const,
  }));

  const eventGigs: StreamCardItem[] = (eventsRes.data ?? []).map((e: Record<string, unknown>) => ({
    id: e.id as string,
    title: (e.name as string) ?? null,
    status: null,
    event_date: e.start_at ? String((e.start_at as string).slice(0, 10)) : null,
    location: null,
    client_name: null,
    source: 'event' as const,
  }));

  const gigs: StreamCardItem[] = [...dealGigs, ...eventGigs].sort((a, b) => {
    const da = a.event_date ?? '';
    const db = b.event_date ?? '';
    return da.localeCompare(db);
  });

  return gigs;
}

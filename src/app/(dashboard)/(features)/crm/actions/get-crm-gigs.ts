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
          .select('id, title, status, proposed_date, organization_id, venue_id')
          .eq('workspace_id', workspaceId)
          .is('archived_at', null)
          .order('proposed_date', { ascending: true })
      : { data: [] as Record<string, unknown>[] },
    workspaceId
      ? supabase
          .schema('ops')
          .from('events')
          .select('id, title, starts_at, lifecycle_status, client_entity_id, venue_entity_id')
          .eq('workspace_id', workspaceId)
          .order('starts_at', { ascending: true })
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  // Resolve client + venue display names from directory.entities in one extra query
  const entityIds = new Set<string>();
  for (const d of (dealsRes.data ?? [])) {
    if (d.organization_id) entityIds.add(d.organization_id as string);
    if (d.venue_id) entityIds.add(d.venue_id as string);
  }
  for (const e of (eventsRes.data ?? [])) {
    if (e.client_entity_id) entityIds.add(e.client_entity_id as string);
    if (e.venue_entity_id) entityIds.add(e.venue_entity_id as string);
  }
  let entityNameMap = new Map<string, string>();
  if (entityIds.size > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', [...entityIds]);
    entityNameMap = new Map(
      (entities ?? []).map((e) => [e.id as string, (e.display_name as string) ?? ''])
    );
  }

  const dealGigs: StreamCardItem[] = (dealsRes.data ?? []).map((d: Record<string, unknown>) => ({
    id: d.id as string,
    title: (d.title as string) ?? null,
    status: (d.status as string) ?? null,
    event_date: d.proposed_date ? String(d.proposed_date) : null,
    location: d.venue_id ? (entityNameMap.get(d.venue_id as string) ?? null) : null,
    client_name: d.organization_id ? (entityNameMap.get(d.organization_id as string) ?? null) : null,
    source: 'deal' as const,
  }));

  const eventGigs: StreamCardItem[] = (eventsRes.data ?? []).map((e: Record<string, unknown>) => ({
    id: e.id as string,
    title: (e.title as string) ?? null,
    status: null,
    event_date: e.starts_at ? String((e.starts_at as string).slice(0, 10)) : null,
    location: e.venue_entity_id ? (entityNameMap.get(e.venue_entity_id as string) ?? null) : null,
    client_name: e.client_entity_id ? (entityNameMap.get(e.client_entity_id as string) ?? null) : null,
    source: 'event' as const,
    lifecycle_status: (e.lifecycle_status as string) ?? null,
  }));

  const gigs: StreamCardItem[] = [...dealGigs, ...eventGigs].sort((a, b) => {
    const da = a.event_date ?? '';
    const db = b.event_date ?? '';
    return da.localeCompare(db);
  });

  return gigs;
}

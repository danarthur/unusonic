import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { NetworkDetailSheetWithSuspense } from '@/widgets/network-detail';
import { ProductionGridShell } from './components/production-grid-shell';
import type { StreamCardItem } from './components/stream-card';

/** CRM queue item: deal or event row mapped for Production Grid UI. */
export type CRMQueueItem = {
  id: string;
  title: string | null;
  status: string | null;
  event_date: string | null;
  location: string | null;
  client_name: string | null;
  source: 'deal' | 'event';
  lifecycle_status?: string | null;
};

const STREAM_MODES = ['inquiry', 'active', 'past'] as const;
export type StreamMode = (typeof STREAM_MODES)[number];

function parseStreamMode(value: string | undefined): StreamMode {
  if (value === 'inquiry' || value === 'active' || value === 'past') return value;
  return 'inquiry';
}

export default async function CRMPage({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string; stream?: string; nodeId?: string; kind?: string }>;
}) {
  const params = await searchParams;
  const selectedId = params.selected ?? null;
  const streamMode = parseStreamMode(params.stream);
  const nodeId = params.nodeId ?? null;
  const kind =
    params.kind === 'external_partner' || params.kind === 'internal_employee' ? params.kind : null;

  let currentOrgId: string | null = null;
  let gigs: StreamCardItem[] = [];

  try {
    currentOrgId = await getCurrentOrgId();
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
          .select('id, title, starts_at, lifecycle_status')
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
      location: null,
      client_name: null,
      source: 'event' as const,
      lifecycle_status: (e.lifecycle_status as string) ?? null,
    }));

    gigs = [...dealGigs, ...eventGigs].sort((a, b) => {
      const da = a.event_date ?? '';
      const db = b.event_date ?? '';
      return da.localeCompare(db);
    });
  } catch (err) {
    console.error('[CRM] page load error:', err);
    // Render shell with empty list so user can retry or navigate; avoid 500
  }

  // Pass selectedId from URL when it's in the server list OR when server list is empty
  // (so client can show Prism after getCrmGigs() populates the list on load failure).
  const effectiveSelectedId =
    selectedId && (gigs.some((g) => g.id === selectedId) || gigs.length === 0)
      ? selectedId
      : null;

  return (
    <>
      <ProductionGridShell
        gigs={gigs}
        selectedId={effectiveSelectedId}
        streamMode={streamMode}
        currentOrgId={currentOrgId}
      />
      {nodeId && kind && currentOrgId && (
        <NetworkDetailSheetWithSuspense
          nodeId={nodeId}
          kind={kind}
          sourceOrgId={currentOrgId}
          returnPath={`/crm${selectedId ? `?selected=${selectedId}&stream=${streamMode}` : ''}`}
        />
      )}
    </>
  );
}

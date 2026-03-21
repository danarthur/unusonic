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
          .select('id, title, status, proposed_date')
          .eq('workspace_id', workspaceId)
          .order('proposed_date', { ascending: true })
      : { data: [] as Record<string, unknown>[] },
    workspaceId
      ? (async () => {
          const { data: projects } = await supabase
            .schema('ops')
            .from('projects')
            .select('id')
            .eq('workspace_id', workspaceId);
          const projectIds = (projects ?? []).map((p: { id: string }) => p.id);
          if (projectIds.length === 0) return { data: [] as Record<string, unknown>[] };
          return supabase
            .schema('ops')
            .from('events')
            .select('id, name, start_at')
            .in('project_id', projectIds)
            .order('start_at', { ascending: true });
        })()
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
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
        />
      )}
    </>
  );
}

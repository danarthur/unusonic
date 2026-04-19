import { Suspense } from 'react';
import { getWorkspaceFeatureState } from '@/app/(dashboard)/(features)/aion/actions/consent-actions';
import { AionSettingsView } from './AionSettingsView';
import { StagePanel } from '@/shared/ui/stage-panel';

export const dynamic = 'force-dynamic';

export default async function AionSettingsPage() {
  const state = await getWorkspaceFeatureState();

  if (!state) {
    return (
      <div className="p-6">
        <StagePanel padding="md">
          <p className="text-sm text-[var(--stage-text-secondary)]">
            Sign in and select a workspace to manage Aion settings.
          </p>
        </StagePanel>
      </div>
    );
  }

  // Admin view gets pending-request detail; reader fetches them inline.
  const pendingRequests = state.isAdmin
    ? await loadPendingRequests(state.workspaceId)
    : [];

  return (
    <Suspense fallback={null}>
      <AionSettingsView state={state} pendingRequests={pendingRequests} />
    </Suspense>
  );
}

async function loadPendingRequests(workspaceId: string) {
  const { createClient } = await import('@/shared/api/supabase/server');
  const supabase = await createClient();
  const { data } = await supabase
    .schema('cortex')
    .from('feature_access_requests')
    .select('id, requested_by, feature_key, requested_at, metadata')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    requested_by: string;
    feature_key: string;
    requested_at: string;
    metadata: Record<string, unknown>;
  }>;

  if (rows.length === 0) return [];

  // Enrich requester names via a separate profiles lookup — `profiles` is
  // keyed on id=user_id, not related to workspace_members in the typed
  // Supabase graph so we can't join inline.
  const uniqueIds = [...new Set(rows.map((r) => r.requested_by))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', uniqueIds);
  const nameMap = new Map<string, string>();
  for (const p of (profiles ?? []) as Array<{
    id: string;
    full_name: string | null;
    email: string | null;
  }>) {
    nameMap.set(p.id, p.full_name || p.email || p.id);
  }

  return rows.map((r) => ({
    ...r,
    requester_name: nameMap.get(r.requested_by) ?? r.requested_by,
  }));
}

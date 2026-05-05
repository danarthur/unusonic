'use client';

import { usePathname } from 'next/navigation';
import { useOptimistic, useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stream } from './stream';
import { Prism } from './prism';
import type { StreamCardItem } from './stream-card';
import type { OptimisticUpdate } from './crm-production-queue';
import type { StreamMode } from '../page';
import type { WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { crmQueries } from '@/features/crm/api/queries';
import { queryKeys } from '@/shared/api/query-keys';
import { cn } from '@/shared/lib/utils';
import { AionPageContextSetter } from '@/shared/ui/providers/AionPageContextSetter';

// Cache is now managed by TanStack Query — no module-level state needed

function buildCrmSearch(stream: StreamMode, selectedId: string | null): string {
  const params = new URLSearchParams();
  params.set('stream', stream);
  if (selectedId) params.set('selected', selectedId);
  return params.toString();
}

function gigsReducer(
  current: StreamCardItem[],
  update: OptimisticUpdate
): StreamCardItem[] {
  if (update.type === 'add') {
    const gig = update.gig;
    return [...current, { ...gig, source: gig.source ?? 'deal' } as StreamCardItem];
  }
  if (update.type === 'revert') {
    return current.filter((g) => g.id !== update.tempId);
  }
  if (update.type === 'replaceId') {
    return current.map((g) =>
      g.id === update.tempId ? { ...g, id: update.realId } : g
    );
  }
  return current;
}

type ProductionGridShellProps = {
  gigs: StreamCardItem[];
  selectedId: string | null;
  streamMode: StreamMode;
  /** Current Network org id (for client picker and Network Detail Sheet). */
  currentOrgId?: string | null;
  /** When set, render a banner above the stream so users see the empty grid is a failure, not "no deals yet." */
  loadError?: string | null;
  /** Phase 3h: workspace pipeline stages — drives Stream tab filters by kind/tags. */
  pipelineStages?: WorkspacePipelineStage[];
};

export function ProductionGridShell({ gigs, selectedId, streamMode, currentOrgId, loadError, pipelineStages }: ProductionGridShellProps) {
  const pathname = usePathname();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [isMobile, setIsMobile] = useState(false);
  const [currentStream, setCurrentStream] = useState<StreamMode>(streamMode);
  // Selection is client state. URL is synced via history.replaceState so deep-
  // linking and back/forward still work, but selection no longer triggers a
  // full RSC re-render of /crm (which would refetch every gig + stakeholder +
  // proposal + entity just to update the highlighted card).
  const [clientSelectedId, setClientSelectedId] = useState<string | null>(selectedId);

  useEffect(() => {
    setCurrentStream(streamMode);
  }, [streamMode]);

  useEffect(() => {
    setClientSelectedId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    const handler = () => {
      const params = new URLSearchParams(window.location.search);
      setClientSelectedId(params.get('selected'));
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  // TanStack Query manages the gigs list. RSC props seed the cache for instant first render.
  const { data: clientGigs = gigs } = useQuery({
    ...crmQueries.gigs(workspaceId ?? ''),
    enabled: !!workspaceId,
    initialData: gigs,
  });

  const [rawOptimisticGigs, addOptimisticGig] = useOptimistic(clientGigs, gigsReducer);
  // Deduplicate: optimistic add + cache refresh can produce duplicates
  const optimisticGigs = useMemo(() => {
    const seen = new Set<string>();
    return rawOptimisticGigs.filter((g) => {
      const key = `${g.source}-${g.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawOptimisticGigs]);

  // Invalidate the gigs query — passed to CreateGigModal instead of manual refetch
  const invalidateGigs = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.deals.all(workspaceId ?? '') }),
    [queryClient, workspaceId],
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const selectedItem = clientSelectedId
    ? optimisticGigs.find((g) => g.id === clientSelectedId) ?? null
    : null;

  const setStreamMode = (mode: StreamMode) => setCurrentStream(mode);

  const setSelected = (id: string) => {
    setClientSelectedId(id);
    window.history.replaceState(null, '', `${pathname}?${buildCrmSearch(currentStream, id)}`);
  };

  const clearSelected = () => {
    setClientSelectedId(null);
    window.history.replaceState(null, '', `${pathname}?${buildCrmSearch(currentStream, null)}`);
  };

  /**
   * Prime the TanStack cache for a given gig before the user clicks. Called
   * from Stream cards on hover (debounced 150ms inside the card). Same shape
   * as Prism's bundleQuery so a click after a successful prefetch resolves
   * synchronously from cache — no fetch on switch.
   *
   * Chains a plan-bundle prefetch after prism resolves: prism gives us the
   * deal_id (for event-source items), event_id (for deal-source items), and
   * venue_entity_id needed for the plan bundle's venue intel slice. Without
   * the prism result we'd be prefetching with null venueEntityId and missing
   * the cache hit when plan-lens runs with the real id.
   */
  const prefetchBundle = useCallback(
    (id: string, source: 'deal' | 'event') => {
      if (!workspaceId) return;
      const prismCfg = crmQueries.prismBundle(workspaceId, id, source, currentOrgId ?? null);
      void queryClient.prefetchQuery(prismCfg).then(() => {
        const prism = queryClient.getQueryData<import('../actions/get-prism-bundle').PrismBundle>(
          prismCfg.queryKey,
        );
        if (!prism) return;
        const eventScopedId = source === 'event'
          ? id
          : (prism.deal?.event_id ?? null);
        const dealId = source === 'deal'
          ? id
          : (prism.eventSummary?.deal_id ?? null);
        const venueEntityId = prism.eventSummary?.venue_entity_id ?? null;
        if (!eventScopedId && !dealId) return;
        const planCfg = crmQueries.planBundle(eventScopedId, dealId, venueEntityId);
        void queryClient.prefetchQuery(planCfg);
      });
    },
    [queryClient, workspaceId, currentOrgId],
  );

  // Neighbor prefetch — when a selection lands, warm the bundles for the
  // sibling immediately above and below in the current sorted/filtered view.
  // Covers keyboard arrow-nav and the natural scan-and-click rhythm without
  // the explosive cost of prefetching the whole list.
  useEffect(() => {
    if (!clientSelectedId || !workspaceId) return;
    const idx = optimisticGigs.findIndex((g) => g.id === clientSelectedId);
    if (idx === -1) return;
    const neighbors = [optimisticGigs[idx - 1], optimisticGigs[idx + 1]].filter(
      (g): g is StreamCardItem => !!g,
    );
    for (const n of neighbors) {
      prefetchBundle(n.id, n.source);
    }
  }, [clientSelectedId, workspaceId, optimisticGigs, prefetchBundle]);

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 relative" data-surface="void" style={{ background: 'var(--stage-void)' }}>
      <AionPageContextSetter type="crm" entityId={clientSelectedId} label={null} />
      {loadError && (
        <div
          role="alert"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[520px] w-[calc(100%-1.5rem)] rounded-lg border border-[var(--color-unusonic-error)]/30 bg-[var(--stage-surface)] px-4 py-2.5 text-sm text-[var(--color-unusonic-error)] shadow-[var(--stage-shadow-card)]"
        >
          {loadError}
        </div>
      )}
      {/* Left: Stream. On mobile hidden when item selected; on desktop always visible. */}
      <aside
        className={cn(
          'flex flex-col shrink-0 w-full md:w-[380px] md:min-w-[320px] max-w-[420px]',
          clientSelectedId && 'hidden md:flex'
        )}
      >
        <Stream
          items={optimisticGigs}
          selectedId={clientSelectedId}
          onSelect={setSelected}
          onHover={prefetchBundle}
          addOptimisticGig={addOptimisticGig}
          onRefetchList={invalidateGigs}
          mode={currentStream}
          onModeChange={setStreamMode}
          sourceOrgId={currentOrgId}
          pipelineStages={pipelineStages ?? []}
        />
      </aside>

      {/* Right: Prism or empty. On mobile only visible when selected (stack); on desktop always. */}
      <main
        className={cn(
          'flex flex-col flex-1 min-w-0 min-h-0',
          !clientSelectedId && 'hidden md:flex'
        )}
      >
        {clientSelectedId ? (
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] gap-3 text-[var(--stage-text-secondary)] text-sm">
                <div className="h-8 w-8 stage-skeleton" style={{ background: 'var(--stage-surface)', borderRadius: 'var(--stage-radius-nested, 8px)' }} aria-hidden />
                <p>Loading…</p>
              </div>
            }
          >
            <Prism
              selectedId={clientSelectedId}
              selectedItem={selectedItem}
              onBackToStream={clearSelected}
              showBackToStream={isMobile}
              sourceOrgId={currentOrgId ?? null}
            />
          </Suspense>
        ) : (
          <div className="bento-center flex-1 p-8 text-center">
            <p className="text-[var(--stage-text-secondary)] leading-relaxed text-sm max-w-sm">
              {optimisticGigs.length === 0
                ? 'No productions yet. Create one to get started.'
                : 'Select a production from the stream.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

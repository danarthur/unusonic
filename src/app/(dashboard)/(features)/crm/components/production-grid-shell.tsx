'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useOptimistic, useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Stream } from './stream';
import { Prism } from './prism';
import type { StreamCardItem } from './stream-card';
import type { OptimisticUpdate } from './crm-production-queue';
import type { StreamMode } from '../page';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { crmQueries } from '@/features/crm/api/queries';
import { queryKeys } from '@/shared/api/query-keys';
import { cn } from '@/shared/lib/utils';

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
};

export function ProductionGridShell({ gigs, selectedId, streamMode, currentOrgId }: ProductionGridShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const [isMobile, setIsMobile] = useState(false);
  const [currentStream, setCurrentStream] = useState<StreamMode>(streamMode);

  useEffect(() => {
    setCurrentStream(streamMode);
  }, [streamMode]);

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

  const selectedItem = selectedId
    ? optimisticGigs.find((g) => g.id === selectedId) ?? null
    : null;

  const setStreamMode = (mode: StreamMode) => setCurrentStream(mode);

  const setSelected = (id: string) => {
    router.replace(`${pathname}?${buildCrmSearch(currentStream, id)}`, { scroll: false });
  };

  const clearSelected = () => {
    router.replace(`${pathname}?${buildCrmSearch(currentStream, null)}`, { scroll: false });
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 relative" data-surface="void" style={{ background: 'var(--stage-void)' }}>
      {/* Left: Stream. On mobile hidden when item selected; on desktop always visible. */}
      <aside
        className={cn(
          'flex flex-col shrink-0 w-full md:w-[380px] md:min-w-[320px] max-w-[420px]',
          selectedId && 'hidden md:flex'
        )}
      >
        <Stream
          items={optimisticGigs}
          selectedId={selectedId}
          onSelect={setSelected}
          addOptimisticGig={addOptimisticGig}
          onRefetchList={invalidateGigs}
          mode={currentStream}
          onModeChange={setStreamMode}
          sourceOrgId={currentOrgId}
        />
      </aside>

      {/* Right: Prism or empty. On mobile only visible when selected (stack); on desktop always. */}
      <main
        className={cn(
          'flex flex-col flex-1 min-w-0 min-h-0',
          !selectedId && 'hidden md:flex'
        )}
      >
        {selectedId ? (
          <Suspense
            fallback={
              <div className="flex flex-col items-center justify-center flex-1 min-h-[200px] gap-3 text-[var(--stage-text-secondary)] text-sm">
                <div className="h-8 w-8 stage-skeleton" style={{ background: 'var(--stage-surface)', borderRadius: 'var(--stage-radius-nested, 8px)' }} aria-hidden />
                <p>Loading…</p>
              </div>
            }
          >
            <Prism
              selectedId={selectedId}
              selectedItem={selectedItem}
              onBackToStream={clearSelected}
              showBackToStream={isMobile}
              sourceOrgId={currentOrgId ?? null}
            />
          </Suspense>
        ) : (
          <div className="bento-center flex-1 p-8 text-center">
            <p className="text-[var(--stage-text-secondary)] leading-relaxed text-sm max-w-sm">
              Select a production from the stream.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

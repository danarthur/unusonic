'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useOptimistic, useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import { Stream } from './stream';
import { Prism } from './prism';
import type { StreamCardItem } from './stream-card';
import type { OptimisticUpdate } from './crm-production-queue';
import type { StreamMode } from '../page';
import { getCrmGigs } from '../actions/get-crm-gigs';
import { cn } from '@/shared/lib/utils';

/** Module-level cache so the list survives remounts (e.g. Next.js re-rendering the page segment). */
let sharedGigsCache: StreamCardItem[] = [];
let sharedGigsCacheTs = 0;
const STALE_MS = 30_000; // consider cache stale after 30s

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
  const [isMobile, setIsMobile] = useState(false);
  const [currentStream, setCurrentStream] = useState<StreamMode>(streamMode);

  useEffect(() => {
    setCurrentStream(streamMode);
  }, [streamMode]);

  // Use cached data for instant render on revisits, RSC props as fallback
  const [clientGigs, setClientGigs] = useState<StreamCardItem[]>(() => {
    if (sharedGigsCache.length > 0) return sharedGigsCache;
    return gigs;
  });
  useEffect(() => {
    if (clientGigs.length > 0) {
      sharedGigsCache = clientGigs;
      sharedGigsCacheTs = Date.now();
    }
  }, [clientGigs]);

  // When RSC re-renders (e.g. after router.refresh()), sync the fresh gigs into client state.
  const prevGigsRef = useRef(gigs);
  useEffect(() => {
    if (gigs === prevGigsRef.current) return;
    prevGigsRef.current = gigs;
    sharedGigsCache = gigs;
    sharedGigsCacheTs = Date.now();
    setClientGigs(gigs);
  }, [gigs]);

  // Background refresh: if cache is stale or we mounted with empty data,
  // fetch fresh in the background so the list stays current without blocking render.
  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    const isStale = Date.now() - sharedGigsCacheTs > STALE_MS;
    const isEmpty = sharedGigsCache.length === 0 && gigs.length === 0;
    if (!isStale && !isEmpty) return; // fresh data from RSC or cache, skip
    let cancelled = false;
    getCrmGigs().then((fetched) => {
      if (cancelled) return;
      sharedGigsCache = fetched;
      sharedGigsCacheTs = Date.now();
      setClientGigs(fetched);
    });
    return () => { cancelled = true; };
  }, [gigs]);
  const [rawOptimisticGigs, addOptimisticGig] = useOptimistic(clientGigs, gigsReducer);
  // Deduplicate: refetchGigs + router.refresh can both add the same deal
  const optimisticGigs = useMemo(() => {
    const seen = new Set<string>();
    return rawOptimisticGigs.filter((g) => {
      const key = `${g.source}-${g.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rawOptimisticGigs]);
  useEffect(() => {
    if (optimisticGigs.length > 0) sharedGigsCache = optimisticGigs;
  }, [optimisticGigs]);

  // Passed to CreateGigModal so it can pull a fresh list immediately after success,
  // without relying on router.refresh() to propagate through prevGigsRef.
  const refetchGigs = useCallback(async () => {
    const fetched = await getCrmGigs();
    sharedGigsCache = fetched;
    sharedGigsCacheTs = Date.now();
    setClientGigs(fetched);
  }, []);

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
    <div className="flex flex-col md:flex-row h-full min-h-[80vh] md:min-h-0 relative" data-surface="void" style={{ background: 'var(--stage-void)' }}>
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
          onRefetchList={refetchGigs}
          mode={currentStream}
          onModeChange={setStreamMode}
          sourceOrgId={currentOrgId}
        />
      </aside>

      {/* Right: Prism or empty. On mobile only visible when selected (stack); on desktop always. */}
      <main
        className={cn(
          'flex flex-col flex-1 min-w-0',
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

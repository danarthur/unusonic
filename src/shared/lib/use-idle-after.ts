import { useEffect, useState } from 'react';

/**
 * Returns true once the trigger condition has been true AND the browser is
 * idle. Used to defer ambient panel fetches until after the primary bundle
 * has resolved, so they don't compete with blocking content for network
 * slots on cold paint.
 *
 * Falls back to `setTimeout(0)` in browsers without `requestIdleCallback`
 * (Safari). SSR-safe: returns `false` until the effect runs on the client.
 *
 * Phase 2 of the Plan-tab cold-paint fix (2026-05-07). See
 * `docs/audits/plan-tab-cold-paint-investigation-2026-05-07.md` and the
 * synchronized-reveal pattern in `docs/reference/code/perf-patterns.md` §3.
 *
 * @example
 * // Inside plan-lens.tsx:
 * const { isLoading: bundleLoading } = useQuery({ ... });
 * const idleReady = useIdleAfter(!bundleLoading);
 *
 * return (
 *   <>
 *     <PrimaryBlockingContent />
 *     {idleReady && event.venue_entity_id && (
 *       <VenueIntelCard venueEntityId={event.venue_entity_id} />
 *     )}
 *   </>
 * );
 */
export function useIdleAfter(trigger: boolean): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!trigger || ready) return;
    if (typeof window === 'undefined') return; // SSR guard
    if (typeof window.requestIdleCallback !== 'function') {
      const t = setTimeout(() => setReady(true), 0);
      return () => clearTimeout(t);
    }
    const id = window.requestIdleCallback(() => setReady(true), { timeout: 1000 });
    return () => window.cancelIdleCallback(id);
  }, [trigger, ready]);
  return ready;
}

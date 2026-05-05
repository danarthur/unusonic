'use client';

/**
 * DetailPaneTransition — sibling-switch transition primitive.
 *
 * Solves a specific perception problem: when the user picks a sibling item in
 * a list-on-left + detail-on-right layout, the detail pane often shows the
 * NEW header (sourced from list memory) above the OLD body (sourced from a
 * server fetch that hasn't returned yet). Users read this as "the data is
 * wrong" rather than "the data is loading," because the brain treats visual
 * coherence as semantic coherence — fresh-looking content is assumed correct.
 *
 * The fix is an atomic swap with a graceful fallback:
 *
 *   - On click: rail row updates selected state immediately (the click is
 *     acknowledged at the source — that's the contract). The detail pane
 *     dims to 70% opacity over 80ms but keeps the previous bundle's data.
 *   - If the new bundle arrives before `skeletonThreshold` (default 250ms):
 *     dim → snap to full opacity with the new content. No skeleton ever
 *     shown. ~70% of warm fetches resolve here.
 *   - If the fetch is still in flight at the threshold: dim → skeleton.
 *     Honest "I am loading." When the bundle arrives: skeleton → content,
 *     atomic frame.
 *   - On first ever load (no previous bundle): skeleton from the start.
 *
 * Why this shape:
 *   - User Advocate (2026-04-28): production owners triage in motion. The
 *     "fresh header + stale body" state is read as misinformation, not slow.
 *   - Field Expert (2026-04-28): atomic swap is the contract every best-in-
 *     class detail panel preserves (Linear, Superhuman, Asana). Skeletons are
 *     fine; lying-by-omission is not.
 *   - Critic (2026-04-28): holding the header without click feedback risks
 *     double-clicks and race conditions. Resolved by keeping the rail row
 *     instant and letting the detail pane hold.
 *
 * Caller contract:
 *   - You pass `bundleKey` (the id of the currently selected item) and
 *     `isFetching` (whether a fetch for that key is in flight).
 *   - Your `children` should derive ALL displayed values (header AND body)
 *     from the bundle data — not from the list-row memory. The parent must
 *     keep the OLD bundle in memory until the new one arrives (TanStack
 *     Query's `placeholderData: keepPreviousData` is the canonical way).
 *   - `isFirstLoad` is true only when there's literally no prior bundle to
 *     show. After that, `isFetching` is the source of truth.
 *   - Pass `scrollContainerRef` if the pane has its own scroll region you
 *     want reset to top on a new selection.
 *
 * Reference impl: `src/app/(dashboard)/(features)/productions/components/prism.tsx`.
 */

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { motion } from 'framer-motion';

export type DetailPaneTransitionProps = {
  /**
   * Stable identifier for the currently selected item. Null when nothing is
   * selected — the `empty` slot renders.
   */
  bundleKey: string | null;
  /**
   * True only on the very first paint when no prior bundle exists to display.
   * Renders the skeleton without a dim phase. Once any bundle has resolved,
   * subsequent transitions are driven by `isFetching`.
   */
  isFirstLoad: boolean;
  /**
   * True while a server fetch for the current bundle is in flight. Drives
   * the dim-and-hold transition.
   */
  isFetching: boolean;
  /** Skeleton element rendered during cold-cache loads (>= threshold). */
  skeleton: ReactNode;
  /** Optional empty-state element when bundleKey is null. Defaults to null. */
  empty?: ReactNode;
  /** Real content — must be derived from the bundle data, not list memory. */
  children: ReactNode;
  /**
   * Milliseconds the dimmed pane will hold the previous bundle's content
   * before crossfading to a skeleton. Default 250ms — most warm fetches
   * resolve under this threshold and stay flicker-free.
   */
  skeletonThreshold?: number;
  /**
   * Optional ref to a scrollable element inside the pane. When a new bundle
   * resolves, this element's scrollTop is reset to 0. Useful when the pane
   * has multiple sections and the user is switching contexts.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Optional className on the outer wrapper. */
  className?: string;
};

export function DetailPaneTransition({
  bundleKey,
  isFirstLoad,
  isFetching,
  skeleton,
  empty,
  children,
  skeletonThreshold = 250,
  scrollContainerRef,
  className,
}: DetailPaneTransitionProps) {
  const [showSkeleton, setShowSkeleton] = useState(false);
  const lastResolvedKey = useRef<string | null>(null);

  // Threshold timer — flips to skeleton if fetch hasn't returned in time.
  useEffect(() => {
    if (!isFetching) {
      setShowSkeleton(false);
      return;
    }
    setShowSkeleton(false);
    const t = setTimeout(() => setShowSkeleton(true), skeletonThreshold);
    return () => clearTimeout(t);
  }, [isFetching, bundleKey, skeletonThreshold]);

  // Reset scroll when a NEW bundle resolves (not when the same one re-fetches).
  useEffect(() => {
    if (!isFetching && bundleKey && bundleKey !== lastResolvedKey.current) {
      lastResolvedKey.current = bundleKey;
      const el = scrollContainerRef?.current;
      if (el) el.scrollTop = 0;
    }
  }, [isFetching, bundleKey, scrollContainerRef]);

  if (!bundleKey) return <>{empty ?? null}</>;

  const renderSkeleton = isFirstLoad || (isFetching && showSkeleton);
  // Dim only during the early "holding previous content" phase.
  const dimmed = isFetching && !renderSkeleton && !isFirstLoad;

  return (
    <motion.div
      animate={{ opacity: dimmed ? 0.7 : 1 }}
      transition={{ duration: dimmed ? 0.08 : 0, ease: 'easeOut' }}
      className={className}
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
    >
      {renderSkeleton ? skeleton : children}
    </motion.div>
  );
}

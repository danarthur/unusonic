'use client';

/**
 * LensCrossfade — keyed content swap with a 120ms fade-in.
 *
 * Replaces the framer-motion AnimatePresence pattern for cases where:
 *   - Multiple keyed sibling panels need to swap based on a state value
 *   - Layout is fixed (no exit-position drama needed)
 *   - You need correctness over coordinated exit + enter transitions
 *
 * Born out of the prism.tsx lens swap deadlock (2026-05-04): an
 * `<AnimatePresence mode="wait">` over five conditionally-rendered keyed
 * motion.div siblings hung the exit animation when one branch carried
 * `initial={false}`. Symptom: deal motion.div stayed mounted at full opacity,
 * Plan content never appeared, no console error. mode="popLayout" and a
 * single-keyed motion.div both reproduced the same hang. AnimatePresence is
 * the wrong tool for "swap one detail panel for another inside a held pane."
 *
 * This primitive is correctness-first: render children for the current key,
 * fade in via Web Animations API on subsequent key changes. No exit
 * animation (the previous panel unmounts instantly). Pair with
 * `DetailPaneTransition` upstream to keep the pane held during fetches —
 * the perceived effect is identical to a crossfade without any
 * coordination state to deadlock.
 *
 * Use this for tab/lens swaps inside a detail surface. Don't reach for
 * AnimatePresence unless you genuinely need exit-animation coordination
 * (e.g. layout-id shared elements, list reordering, dismissable banners).
 */

import { useEffect, useRef, type ReactNode } from 'react';

export type LensCrossfadeProps<K extends string> = {
  /** Stable identifier for the active lens. When this changes, the panel fades in. */
  lensKey: K;
  /** Render function returning the panel content for the current key. */
  children: (key: K) => ReactNode;
  /** Fade-in duration in milliseconds. Default 120ms (STAGE_NAV_CROSSFADE). */
  duration?: number;
};

export function LensCrossfade<K extends string>({
  lensKey,
  children,
  duration = 120,
}: LensCrossfadeProps<K>) {
  const ref = useRef<HTMLDivElement>(null);
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (!ref.current) return;
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    const animation = ref.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    );
    return () => {
      animation.cancel();
    };
  }, [lensKey, duration]);

  return <div ref={ref}>{children(lensKey)}</div>;
}

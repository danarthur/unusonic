import { useEffect, useRef, useState } from 'react';

/**
 * Returns a ref + a boolean that flips to `true` the first time the element
 * crosses into the viewport (or within `rootMargin` of it). After the flip,
 * the observer disconnects — this is a "did the user ever look at this?"
 * gate, not a continuous visibility tracker.
 *
 * Falls back to "always in view" in environments without `IntersectionObserver`
 * (SSR or very old browsers) so the fetch still fires on those paths.
 *
 * Phase 3 of the Plan-tab cold-paint fix (2026-05-07). See
 * `docs/audits/plan-tab-cold-paint-investigation-2026-05-07.md` §3.
 *
 * @example
 * const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: '200px' });
 * const { data } = useQuery({ enabled: inView, ... });
 * return <div ref={ref}>{inView ? <RealCard data={data} /> : <Skeleton />}</div>;
 */
export function useInView<T extends Element = HTMLDivElement>(opts?: {
  rootMargin?: string;
}): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  const rootMargin = opts?.rootMargin ?? '200px';

  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR guard
    if (typeof IntersectionObserver === 'undefined') {
      // Unsupported browser — treat as always in view so the fetch still fires.
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView];
}

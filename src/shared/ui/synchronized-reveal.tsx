'use client';

/**
 * SynchronizedReveal — coordinated paint primitive for detail pages.
 *
 * The problem: a detail page (deal lens, event page, network entity) typically
 * has 5-8 data sources. The naive React pattern is one Suspense boundary per
 * section, each showing its own skeleton, each resolving on its own clock.
 * The user sees five skeletons pop in over 700ms — the "loading in waves"
 * complaint. Same total time as a coordinated paint, but the user perceives
 * the page assembling itself in front of them, which reads as amateur.
 *
 * The User Advocate's research said it directly: production owners value
 * confidence over speed. They tolerate 500ms with a clean coordinated paint;
 * they hate 200ms with three intermediate states. The fix isn't faster — it's
 * synchronized.
 *
 * This component implements the pattern:
 *
 *   <SynchronizedReveal
 *     primary={                          // paint TOGETHER
 *       <>
 *         <DealHeaderStrip ... />
 *         <DealKeyFacts ... />
 *       </>
 *     }
 *     ambient={                          // fade in silently AFTER primary
 *       <>
 *         <ConflictsPanel ... />
 *         <AionDealCard ... />
 *         <Timeline ... />
 *       </>
 *     }
 *   />
 *
 * Behaviour:
 *   - The `primary` slot renders inside a single Suspense boundary. The user
 *     sees ONE coordinated skeleton (the `primaryFallback` prop, default a
 *     subtle full-block shimmer) until ALL primary children resolve.
 *   - The `ambient` slot is wrapped in its own Suspense boundary that
 *     defaults to `null` fallback — no skeleton at all. Ambient sections
 *     simply fade in when ready.
 *   - The user perceives: skeleton → primary block lands fully formed →
 *     secondary content fades in around it. One transition, not five.
 *
 * When NOT to use:
 *   - Pages where every section is critical-path (probably none — almost
 *     everything has primary + ambient structure).
 *   - Pages where ambient sections genuinely need their own skeleton because
 *     they take >2s and the user expects feedback. Override with `ambientFallback`.
 *
 * Composition note: this isn't magic — it's just two Suspense boundaries
 * with intentional fallback choices. The value is the convention. Code
 * reviewers reading <SynchronizedReveal> immediately know "this is the
 * primary/ambient split"; reading two <Suspense> boundaries inline doesn't
 * communicate intent.
 */

import { Suspense, type ReactNode } from 'react';

export type SynchronizedRevealProps = {
  /** Above-the-fold critical content. Painted as one coordinated block. */
  primary: ReactNode;
  /** Below-the-fold or ambient panels. Fades in silently after primary. */
  ambient?: ReactNode;
  /**
   * Skeleton shown while the primary block is loading. Pass a custom one
   * sized to your detail page; the default is a single subtle shimmer block.
   */
  primaryFallback?: ReactNode;
  /**
   * Fallback shown while ambient content is loading. Defaults to `null` —
   * no skeleton at all. Override only if a section is genuinely slow enough
   * to need feedback (>2s typical).
   */
  ambientFallback?: ReactNode;
  /**
   * Optional className on the outer wrapper. Useful for layout/spacing.
   */
  className?: string;
};

const DefaultPrimaryFallback = () => (
  <div
    aria-hidden
    style={{
      width: '100%',
      minHeight: 200,
      borderRadius: 'var(--stage-radius-card, 12px)',
      background:
        'linear-gradient(120deg, oklch(1 0 0 / 0.03) 0%, oklch(1 0 0 / 0.06) 50%, oklch(1 0 0 / 0.03) 100%)',
      backgroundSize: '200% 100%',
      animation: 'unusonic-shimmer 1.6s ease-in-out infinite',
    }}
  />
);

export function SynchronizedReveal({
  primary,
  ambient,
  primaryFallback = <DefaultPrimaryFallback />,
  ambientFallback = null,
  className,
}: SynchronizedRevealProps) {
  return (
    <div className={className}>
      {/* Primary block — one coordinated skeleton, paints together. */}
      <Suspense fallback={primaryFallback}>{primary}</Suspense>

      {/* Ambient panels — silent fade-in by default. */}
      {ambient !== undefined && (
        <Suspense fallback={ambientFallback}>{ambient}</Suspense>
      )}

      {/* Shimmer keyframes scoped via a global once at the layout level —
          if not present, the default fallback renders without animation,
          which is fine. We don't add the keyframes here to avoid duplicate
          declarations across pages. */}
    </div>
  );
}

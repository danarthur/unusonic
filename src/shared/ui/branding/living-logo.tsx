'use client';

import { useId, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

/**
 * Phase Mark — The Unusonic Living Logo
 *
 * Two identical pills offset along a shallow diagonal.
 * Surface read: a precision production tool mark.
 * Deep read: coniunctio oppositorum — two aspects of one reality
 * held in productive tension, drifting toward synchronicity.
 *
 * The gap between them is the product. The shared form is the unus mundus.
 * The moment of alignment is synchronicity — brief, earned, then life continues.
 */

// ─── Geometry ───────────────────────────────────────────────────────────────
// ViewBox: 40x40. Two pills, each 14x6 with rx=3 (machined radius).
// Resting offset: left pill higher by 4 units, creating the phase relationship.
// 180° rotational symmetry — the mark reads the same upside down.

const PILL_WIDTH = 14;
const PILL_HEIGHT = 6;
const PILL_RX = 3;
const GAP = 2;            // horizontal gap between pills at closest point
const PHASE_OFFSET = 4;   // vertical offset (the tension of opposites)

// Center the composition in the 40x40 viewBox
const CENTER_X = 20;
const CENTER_Y = 20;
const HALF_SPAN = (PILL_WIDTH + GAP + PILL_WIDTH) / 2; // total horizontal span / 2

// Left pill: higher
const L_X = CENTER_X - HALF_SPAN;
const L_Y = CENTER_Y - PILL_HEIGHT / 2 - PHASE_OFFSET / 2;

// Right pill: lower
const R_X = CENTER_X - HALF_SPAN + PILL_WIDTH + GAP;
const R_Y = CENTER_Y - PILL_HEIGHT / 2 + PHASE_OFFSET / 2;

// ─── Sizes ──────────────────────────────────────────────────────────────────
const SIZE_MAP = { sm: 24, md: 40, lg: 56, xl: 80 } as const;

// ─── Status colors (flat fill, no gradients — Stage Engineering) ────────────
const STATUS_FILLS: Record<string, string> = {
  idle:     'var(--stage-accent, oklch(1 0 0))',
  loading:  'var(--stage-accent, oklch(1 0 0))',
  thinking: 'var(--stage-accent, oklch(1 0 0))',
  success:  'var(--color-unusonic-success, oklch(0.75 0.18 145))',
  error:    'var(--color-unusonic-error, oklch(0.70 0.18 20))',
  ambient:  'var(--stage-text-secondary, oklch(0.60 0 0))',
};

// ─── Animation configs ──────────────────────────────────────────────────────

// Tidal drift: pills oscillate closer/further during loading
const TIDAL_SPRING = { stiffness: 20, damping: 8, mass: 1.5 };

// Impulse snap: brief deflect on success/error
const IMPULSE_SPRING = { type: 'spring' as const, stiffness: 450, damping: 28, mass: 0.5 };

// Aion rotation: slow, constant, cyclical
const AION_ROTATION = { duration: 12, repeat: Infinity, ease: 'linear' as const };

// ─── Types ──────────────────────────────────────────────────────────────────
export type LivingLogoStatus =
  | 'idle'
  | 'loading'
  | 'thinking'
  | 'success'
  | 'error'
  | 'ambient';

interface LivingLogoProps {
  status?: LivingLogoStatus;
  size?: keyof typeof SIZE_MAP | number;
  className?: string;
}

// ─── Component ──────────────────────────────────────────────────────────────
export function LivingLogo({
  status = 'idle',
  size = 'md',
  className,
}: LivingLogoProps) {
  const id = useId().replace(/:/g, '');
  const prefersReducedMotion = useReducedMotion();
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const fill = STATUS_FILLS[status] ?? STATUS_FILLS.idle;

  const isLoading = status === 'loading';
  const isThinking = status === 'thinking';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const isIdle = status === 'idle' || status === 'ambient';

  // Compute the dynamic offset for the tidal drift
  // Loading: oscillate between close (1) and far (7)
  // Success: converge to near-alignment (0.5)
  // Error: diverge to max (7)
  // Idle: resting offset (4)
  const targetOffset = isLoading
    ? PHASE_OFFSET // animated via keyframes below
    : isSuccess
      ? 0.5
      : isError
        ? 7
        : PHASE_OFFSET;

  // For the tidal loading animation, we use keyframes
  const loadingKeyframes = isLoading && !prefersReducedMotion
    ? [PHASE_OFFSET, 1, PHASE_OFFSET]
    : undefined;

  return (
    <div
      data-living-logo
      role="img"
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center shrink-0 ${className ?? ''}`.trim()}
      style={{ width: px, height: px }}
    >
      <motion.svg
        width={px}
        height={px}
        viewBox="0 0 40 40"
        className="block"
        aria-hidden="true"
        style={{ transformOrigin: '20px 20px' }}
        // Aion thinking: slow rotation of the entire mark
        animate={{
          rotate: isThinking && !prefersReducedMotion ? 360 : 0,
        }}
        transition={isThinking ? AION_ROTATION : IMPULSE_SPRING}
      >
        {/* Left pill (higher) */}
        <motion.rect
          x={L_X}
          width={PILL_WIDTH}
          height={PILL_HEIGHT}
          rx={PILL_RX}
          fill={fill}
          animate={{
            y: loadingKeyframes
              ? loadingKeyframes.map(o => CENTER_Y - PILL_HEIGHT / 2 - o / 2)
              : CENTER_Y - PILL_HEIGHT / 2 - targetOffset / 2,
          }}
          transition={
            isLoading && !prefersReducedMotion
              ? {
                  y: {
                    duration: 5,
                    repeat: Infinity,
                    repeatType: 'mirror' as const,
                    ease: 'easeInOut',
                  },
                }
              : IMPULSE_SPRING
          }
        />

        {/* Right pill (lower) */}
        <motion.rect
          x={R_X}
          width={PILL_WIDTH}
          height={PILL_HEIGHT}
          rx={PILL_RX}
          fill={fill}
          animate={{
            y: loadingKeyframes
              ? loadingKeyframes.map(o => CENTER_Y - PILL_HEIGHT / 2 + o / 2)
              : CENTER_Y - PILL_HEIGHT / 2 + targetOffset / 2,
          }}
          transition={
            isLoading && !prefersReducedMotion
              ? {
                  y: {
                    duration: 5,
                    repeat: Infinity,
                    repeatType: 'mirror' as const,
                    ease: 'easeInOut',
                  },
                }
              : IMPULSE_SPRING
          }
        />
      </motion.svg>
    </div>
  );
}

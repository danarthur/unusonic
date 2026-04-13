'use client';

import { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate, useReducedMotion } from 'framer-motion';

/**
 * Aion Mark — The Aion Living Logo
 *
 * Two arc segments forming a broken circle — the ouroboros.
 * Rendered as filled paths (outlined thick arcs) for print/export safety.
 *
 * The "one violation": gaps are asymmetric (25° and 35°).
 * The wider gap sits at ~1 o'clock, echoing the Phase Mark's diagonal offset.
 *
 * Tidal breath animation: arcs grow toward closure (approaching wholeness)
 * then recede (the gaps reopen, consciousness re-enters). The circle
 * deliberately never closes — the Self is approached but never fully realized.
 *
 * Surface read: a precision AI indicator.
 * Deep read: the ouroboros — eternal return, the Self as totality.
 */

// ─── Geometry ───────────────────────────────────────────────────────────────
const MIDLINE_R = 12;
const THICKNESS = 6;
const OUTER_R = MIDLINE_R + THICKNESS / 2; // 15
const INNER_R = MIDLINE_R - THICKNESS / 2; // 9
const CAP_R = THICKNESS / 2;               // 3

const BASE_ROTATION = -60;

// Resting arcs: asymmetric gaps (25° / 35°)
const ARC_1_REST = 155;
const ARC_2_REST = 145;
const GAP_1 = 25;

// Breathing arcs: approach closure (gaps shrink to 10° / 20°)
const ARC_1_REACH = 170;
const ARC_2_REACH = 160;

// Success arcs: near-closure (gaps shrink to 5° / 15°)
const ARC_1_SUCCESS = 175;
const ARC_2_SUCCESS = 165;

// Error arcs: wide gaps (gaps grow to 40° / 50°)
const ARC_1_ERROR = 140;
const ARC_2_ERROR = 130;

// Arc start positions (constant — gaps grow/shrink from the ends)
const ARC_1_START_DEG = 0 + BASE_ROTATION;
const ARC_2_START_DEG = ARC_1_REST + GAP_1 + BASE_ROTATION; // 180° + base

// ─── Sizes ──────────────────────────────────────────────────────────────────
const SIZE_MAP = { sm: 24, md: 40, lg: 56, xl: 80 } as const;

// ─── Status colors ──────────────────────────────────────────────────────────
const STATUS_FILLS: Record<string, string> = {
  idle:     'var(--stage-accent, oklch(1 0 0))',
  loading:  'var(--stage-accent, oklch(1 0 0))',
  thinking: 'var(--stage-accent, oklch(1 0 0))',
  success:  'var(--color-unusonic-success, oklch(0.75 0.18 145))',
  error:    'var(--color-unusonic-error, oklch(0.70 0.18 20))',
  ambient:  'var(--stage-text-secondary, oklch(0.60 0 0))',
};

// ─── Animation configs ──────────────────────────────────────────────────────
const IMPULSE_SPRING = { type: 'spring' as const, stiffness: 450, damping: 28, mass: 0.5 };
const AION_ROTATION = { duration: 8, repeat: Infinity, ease: 'linear' as const };

// ─── Types ──────────────────────────────────────────────────────────────────
export type AionMarkStatus =
  | 'idle'
  | 'loading'
  | 'thinking'
  | 'success'
  | 'error'
  | 'ambient';

interface AionMarkProps {
  status?: AionMarkStatus;
  size?: keyof typeof SIZE_MAP | number;
  className?: string;
}

// ─── Path math ──────────────────────────────────────────────────────────────

const DEG = Math.PI / 180;

function r3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function arcC(
  cx: number, cy: number, r: number,
  startDeg: number, endDeg: number,
): string {
  const s = startDeg * DEG;
  const e = endDeg * DEG;
  const f = (4 / 3) * Math.tan((e - s) / 4);
  return `C${r3(cx + r * (Math.cos(s) - f * Math.sin(s)))},${
    r3(cy + r * (Math.sin(s) + f * Math.cos(s)))
  },${r3(cx + r * (Math.cos(e) + f * Math.sin(e)))},${
    r3(cy + r * (Math.sin(e) - f * Math.cos(e)))
  },${r3(cx + r * Math.cos(e))},${r3(cy + r * Math.sin(e))}`;
}

/**
 * Generate a filled thick-arc path.
 * Structure: M + 8C + Z (matched command count for d-attribute animation).
 */
function thickArc(
  cx: number, cy: number,
  startDeg: number, spanDeg: number,
): string {
  const midDeg = startDeg + spanDeg / 2;
  const endDeg = startDeg + spanDeg;

  const sx = r3(cx + OUTER_R * Math.cos(startDeg * DEG));
  const sy = r3(cy + OUTER_R * Math.sin(startDeg * DEG));

  const eCx = cx + MIDLINE_R * Math.cos(endDeg * DEG);
  const eCy = cy + MIDLINE_R * Math.sin(endDeg * DEG);
  const sCx = cx + MIDLINE_R * Math.cos(startDeg * DEG);
  const sCy = cy + MIDLINE_R * Math.sin(startDeg * DEG);

  return [
    `M${sx},${sy}`,
    arcC(cx, cy, OUTER_R, startDeg, midDeg),
    arcC(cx, cy, OUTER_R, midDeg, endDeg),
    arcC(eCx, eCy, CAP_R, endDeg, endDeg + 90),
    arcC(eCx, eCy, CAP_R, endDeg + 90, endDeg + 180),
    arcC(cx, cy, INNER_R, endDeg, midDeg),
    arcC(cx, cy, INNER_R, midDeg, startDeg),
    arcC(sCx, sCy, CAP_R, startDeg + 180, startDeg + 270),
    arcC(sCx, sCy, CAP_R, startDeg + 270, startDeg + 360),
    'Z',
  ].join('');
}

/** Interpolate between two matched-structure SVG path strings */
function lerpPath(a: string, b: string, t: number): string {
  const numsA = a.match(/-?\d+\.?\d*/g)!.map(Number);
  const numsB = b.match(/-?\d+\.?\d*/g)!.map(Number);
  let idx = 0;
  return a.replace(/-?\d+\.?\d*/g, () => {
    const v = numsA[idx] + (numsB[idx] - numsA[idx]) * t;
    idx++;
    return String(r3(v));
  });
}

// ─── Pre-computed paths ─────────────────────────────────────────────────────
// All paths share M + 8C + Z structure, so Framer Motion can interpolate.

// Resting state
const ARC_1_REST_D = thickArc(20, 20, ARC_1_START_DEG, ARC_1_REST);
const ARC_2_REST_D = thickArc(20, 20, ARC_2_START_DEG, ARC_2_REST);

// Breathing "reach" state — arcs approach closure
const ARC_1_REACH_D = thickArc(20, 20, ARC_1_START_DEG, ARC_1_REACH);
const ARC_2_REACH_D = thickArc(20, 20, ARC_2_START_DEG, ARC_2_REACH);

// Success — near closure
const ARC_1_SUCCESS_D = thickArc(20, 20, ARC_1_START_DEG, ARC_1_SUCCESS);
const ARC_2_SUCCESS_D = thickArc(20, 20, ARC_2_START_DEG, ARC_2_SUCCESS);

// Error — wide gaps
const ARC_1_ERROR_D = thickArc(20, 20, ARC_1_START_DEG, ARC_1_ERROR);
const ARC_2_ERROR_D = thickArc(20, 20, ARC_2_START_DEG, ARC_2_ERROR);

// ─── Component ──────────────────────────────────────────────────────────────
export function AionMark({
  status = 'idle',
  size = 'md',
  className,
}: AionMarkProps) {
  const prefersReducedMotion = useReducedMotion();
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const fill = STATUS_FILLS[status] ?? STATUS_FILLS.idle;

  const isLoading = status === 'loading';
  const isThinking = status === 'thinking';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const shouldBreathe = (isLoading || isThinking) && !prefersReducedMotion;
  const tidalDuration = isThinking ? 2.4 : 5;

  // Tidal breath: a 0→1 motion value drives arc path interpolation
  const breath = useMotionValue(0);

  // Derive the d-attribute strings from breath progress
  const d1 = useTransform(breath, (t: number) =>
    lerpPath(ARC_1_REST_D, ARC_1_REACH_D, t),
  );
  const d2 = useTransform(breath, (t: number) =>
    lerpPath(ARC_2_REST_D, ARC_2_REACH_D, t),
  );

  // Animate breath for loading/thinking states
  useEffect(() => {
    if (!shouldBreathe) {
      breath.set(0);
      return;
    }
    const controls = animate(breath, [0, 1, 0], {
      duration: tidalDuration,
      repeat: Infinity,
      ease: 'easeInOut',
    });
    return () => controls.stop();
  }, [shouldBreathe, tidalDuration, breath]);

  // Static path for success/error (no breath, just a different span)
  const static1 = isSuccess ? ARC_1_SUCCESS_D : isError ? ARC_1_ERROR_D : ARC_1_REST_D;
  const static2 = isSuccess ? ARC_2_SUCCESS_D : isError ? ARC_2_ERROR_D : ARC_2_REST_D;

  return (
    <div
      data-aion-mark
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
        animate={{
          rotate: isThinking && !prefersReducedMotion ? 360 : 0,
        }}
        transition={isThinking ? AION_ROTATION : IMPULSE_SPRING}
      >
        {shouldBreathe ? (
          <>
            {/* Breathing: d driven by motion value (no React re-renders) */}
            <motion.path
              d={d1}
              fill={fill}
              animate={{
                opacity: isThinking ? [1, 0.5, 1] : 1,
              }}
              transition={
                isThinking
                  ? { opacity: { duration: tidalDuration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' } }
                  : IMPULSE_SPRING
              }
            />
            <motion.path
              d={d2}
              fill={fill}
              animate={{
                opacity: isThinking ? [0.5, 1, 0.5] : 1,
              }}
              transition={
                isThinking
                  ? { opacity: { duration: tidalDuration, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' } }
                  : IMPULSE_SPRING
              }
            />
          </>
        ) : (
          <>
            {/* Static: success/error/idle use pre-computed paths with spring transition */}
            <motion.path
              fill={fill}
              animate={{ d: static1 }}
              transition={IMPULSE_SPRING}
            />
            <motion.path
              fill={fill}
              animate={{ d: static2 }}
              transition={IMPULSE_SPRING}
            />
          </>
        )}
      </motion.svg>
    </div>
  );
}

'use client';

/**
 * Aion Mark — The Closed Ring + Centered Self
 *
 * Redesigned 2026-04-19 after deep research into Aion symbolism (cross-
 * tradition: Greek, Orphic/Mithraic, Gnostic, Roman, Zoroastrian, Jungian)
 * and iconic + living-logo design practice.
 *
 * Prior design — broken ouroboros with asymmetric gaps — read as accidental
 * ("a circle that didn't quite close") rather than symbolic. The fix inverts
 * the problem: the ouroboros's self-consuming seam is temporal, not spatial.
 *
 *   At rest     : a single continuous ring + precise center mark. Undivided
 *                 whole (hen to pan, "the all is one"). Jungian mandala —
 *                 totality (perimeter) containing the Self (center).
 *   Thinking    : a lighter ~60° segment travels around the ring. The head
 *                 chasing the tail appears only in motion.
 *   Success     : segment rejoins; ring brightens briefly.
 *   Error       : amber pulse, one-shot.
 *   Idle breath : stroke-width oscillates ~0.2 units over 10s (≥40px only).
 *   Prism       : the whole mark cycles OKLCH hue at near-imperceptible
 *                 chroma (0.025) and high lightness (0.96) over 60s. Reads
 *                 as white at a glance; reveals every color to attention.
 *                 Semantic: Aion contains all — the totality hides its
 *                 multiplicity. Active on idle/loading/thinking only;
 *                 paused on success/error (those colors are semantic) and
 *                 on ambient (intentionally muted).
 *
 * Single idea: a circle that becomes an ouroboros only when time flows.
 *
 * API preserved from prior implementation: status, size, className.
 */

import { useEffect } from 'react';
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  useReducedMotion,
} from 'framer-motion';

// ─── Geometry (viewBox 40×40, center 20,20) ──────────────────────────────
const CX = 20;
const CY = 20;
const RING_R = 14;
const RING_STROKE_BASE = 3;
const RING_STROKE_BREATH_DELTA = 0.22;

const DOT_R_REST = 1.6;
const DOT_R_PEAK = 2.1;

// Traveling-segment geometry:
// Circumference ≈ 2π·14 ≈ 87.96. A ~60° segment = 87.96 × (60/360) ≈ 14.66.
// Remainder becomes the gap (87.96 - 14.66 ≈ 73.3).
const SEGMENT_LEN = 15;
const SEGMENT_GAP = 73;

// Animation below this rendered size is suppressed entirely (research
// threshold: sub-32px motion reads as noise, not animation).
const MIN_ANIMATED_PX = 32;

// ─── Sizes ────────────────────────────────────────────────────────────────
const SIZE_MAP = { sm: 24, md: 40, lg: 56, xl: 80 } as const;

// ─── Status palette ───────────────────────────────────────────────────────
const STATUS_FILLS: Record<string, string> = {
  idle:     'var(--stage-accent, oklch(1 0 0))',
  loading:  'var(--stage-accent, oklch(1 0 0))',
  thinking: 'var(--stage-accent, oklch(1 0 0))',
  success:  'var(--color-unusonic-success, oklch(0.75 0.18 145))',
  error:    'var(--color-unusonic-error, oklch(0.70 0.18 20))',
  ambient:  'var(--stage-text-secondary, oklch(0.60 0 0))',
};

// ─── Motion configs ───────────────────────────────────────────────────────
const SEGMENT_ROTATION_SLOW = { duration: 10, repeat: Infinity, ease: 'linear' as const };
const SEGMENT_ROTATION_FAST = { duration: 5, repeat: Infinity, ease: 'linear' as const };
const SETTLE_SPRING = { type: 'spring' as const, stiffness: 450, damping: 28, mass: 0.5 };

// Prism dispersion — the mark reads as white, but transient rainbow shimmers
// travel across it like light through a prism. Three overlay "sparks" rotate
// at prime-ratio rates (11/13/17s) with independent opacity cycles (7/9/11s),
// so no visible repeat period emerges. Each bloom uses a more-saturated OKLCH
// color offset 120° from the others. At rest the mark is near-white; at bloom
// peaks, brief spectrum events travel the ring surface. Semantic: white light
// entering a prism, splitting into rainbow, resolving back to white.
const PRISM_LIGHTNESS = 0.96;      // base ring/dot — reads white
const PRISM_CHROMA = 0.025;
const PRISM_CYCLE_DURATION = 60;

// Prism dispersion architecture (Apple-Intelligence-halo + Pokemon-holo hybrid):
//   1. Rainbow light-source stack — three rainbow ring strokes at increasing
//      blur levels (sharp core + 1px halo + 3px bleed), composited via
//      plus-lighter. Mimics Siri's edge glow: a lens emitting light, not a
//      colored ring. Gradient composition is status-biased.
//   2. Radial chromatic aberration — red ghost rendered at R+Δ (outside),
//      cyan at R−Δ (inside). Proper prism physics: different wavelengths
//      refract different amounts, so the rainbow splits radially across
//      the stroke. Magnitude + hues vary per status.
//   3. White veil ring on top; opacity pulses between high (reads as white)
//      and low (rainbow shows through). Range + cycle speed vary per status.
//   4. Blend mode plus-lighter on rainbow + aberration layers.
const RAINBOW_STROKE_CORE = 3.2;    // sharp core stroke
// Halo: wider stroke + heavier blur so the glow reads as atmospheric aura,
// not a second painted ring. Previous 4px / 1px blur was "too solid" — the
// stroke boundary was still visible. 6px / 3px blur distributes the density
// across a softer gaussian falloff.
const RAINBOW_STROKE_HALO = 6;
const RAINBOW_BLUR_HALO = 3;

type AionMarkStatusKey = 'idle' | 'loading' | 'thinking' | 'success' | 'error' | 'ambient';

type PrismConfig = {
  /** Gradient ID used for the rainbow stroke (matches <linearGradient id=...>) */
  gradientId: string;
  /** Veil opacity range [peak-rainbow-visibility, reads-as-white]. Lower min = more intense peaks. */
  veilRange: [number, number];
  /** Veil pulse cycle in seconds. Shorter = more anxious/active. */
  cycleS: number;
  /** Rainbow ring rotation cycle in seconds. Can be negative for reverse. */
  rotationS: number;
  /** Chromatic aberration peak offset in user-space units. */
  aberration: number;
};

const STATUS_PRISM: Record<AionMarkStatusKey, PrismConfig> = {
  // Balanced ROYGBIV, gentle breath — nothing demanding attention.
  // Aberration values reduced from 0.55–1.1 → 0.2–0.45 per Critic feedback —
  // the previous range doubled the ring; current values read as edge fringing.
  idle:     { gradientId: 'idle',     veilRange: [0.58, 0.88], cycleS: 9,   rotationS: 24,  aberration: 0.22 },
  loading:  { gradientId: 'idle',     veilRange: [0.52, 0.86], cycleS: 7,   rotationS: 18,  aberration: 0.28 },
  // Cool bias (blues / violets / indigos), faster pulse. The mind is working.
  thinking: { gradientId: 'thinking', veilRange: [0.42, 0.82], cycleS: 4.5, rotationS: 10,  aberration: 0.38 },
  // Green bias, deep dips, vivid peaks. Celebratory.
  success:  { gradientId: 'success',  veilRange: [0.22, 0.72], cycleS: 3.5, rotationS: 8,   aberration: 0.45 },
  // Red/amber bias, agitated cadence. Veil max pushed DOWN from 0.74 → 0.58
  // so the red color stays present at all times — error should never read
  // as white between pulses. Cycle tightened from 3s → 2.4s for anxious
  // rhythm.
  error:    { gradientId: 'error',    veilRange: [0.22, 0.58], cycleS: 2.4, rotationS: -14, aberration: 0.55 },
  // Muted / desaturated. Low-chroma gradient; veil sits mostly opaque.
  ambient:  { gradientId: 'ambient',  veilRange: [0.78, 0.94], cycleS: 14,  rotationS: 40,  aberration: 0.12 },
};

// Per-status head motion. The head ("ouroboros head") rides the ring and
// each status has its own motion signature — the mark communicates state
// through motion quality, not just color:
//   idle     — slow steady drift (30s linear)
//   loading  — medium steady drift (12s linear), reads as "working"
//   thinking — ease-in-out at 6s (accelerates/decelerates each cycle,
//              reads as pondering/processing)
//   success  — burst: fast rotation then pause, celebratory
//   error    — oscillation: jitter back and forth, anxious/stuck
//   ambient  — glacially slow (60s)
type HeadMotion = {
  duration: number;
  keyframes?: number[];
  target?: number;
  times?: number[];
  ease: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
  repeatType?: 'loop' | 'reverse' | 'mirror';
};

const STATUS_HEAD_MOTION: Record<AionMarkStatusKey, HeadMotion> = {
  idle:     { duration: 30,  target: 360,  ease: 'linear' },
  loading:  { duration: 12,  target: 360,  ease: 'linear' },
  thinking: { duration: 6,   target: 360,  ease: 'easeInOut' },
  // Success: ease-out full rotation — starts fast, decelerates into a
  // natural settle. No keyframe hold (Critic: "decelerate into stillness,
  // don't hit a wall"). Repeats with continuous velocity curve.
  success:  { duration: 5,   target: 360,  ease: 'easeOut' },
  // Error: anxious jitter — ring oscillates back and forth without
  // completing a rotation. Amplitude pushed from ±22° → ±48° so the
  // shake is visible at a glance. Stuck, agitated.
  error:    { duration: 2.0, keyframes: [0, 48, -38, 42, -28, 22, -10, 0], ease: 'linear' },
  ambient:  { duration: 60,  target: 360,  ease: 'linear' },
};

const ABERRATION_OPACITY = 0.38;

// ─── Types ────────────────────────────────────────────────────────────────
export type AionMarkStatus =
  | 'idle' | 'loading' | 'thinking' | 'success' | 'error' | 'ambient';

interface AionMarkProps {
  status?: AionMarkStatus;
  size?: keyof typeof SIZE_MAP | number;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────
export function AionMark({
  status = 'idle',
  size = 'md',
  className,
}: AionMarkProps) {
  const prefersReducedMotion = useReducedMotion();
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const fill = STATUS_FILLS[status] ?? STATUS_FILLS.idle;

  const isActive = status === 'loading' || status === 'thinking';
  const isThinking = status === 'thinking';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  const motionAllowed = !prefersReducedMotion && px >= MIN_ANIMATED_PX;
  const shouldBreathe = motionAllowed;
  const shouldTravelSegment = motionAllowed && isActive;
  const shouldRotateShimmer = motionAllowed && isThinking;
  // Prism is on for every status now — the color bias, veil range, rotation
  // direction/speed, and aberration magnitude all modulate with status so
  // the mark communicates state through its own iridescence rather than by
  // switching off. Still gated on motion-allowed (reduced motion + min size).
  const shouldPrism = motionAllowed;
  const prismConfig = STATUS_PRISM[status] ?? STATUS_PRISM.idle;

  // Breath drives stroke-width oscillation + dot-radius pulse.
  const breath = useMotionValue(0);
  const ringStroke = useTransform(
    breath,
    (t: number) => RING_STROKE_BASE + t * RING_STROKE_BREATH_DELTA,
  );
  const dotRadius = useTransform(
    breath,
    (t: number) => DOT_R_REST + t * (DOT_R_PEAK - DOT_R_REST),
  );

  // Single rotation source: headRotation drives the whole mark body. The
  // rainbow ring, aberrations, and head dot rotate together so the whole
  // serpent moves as one. Motion signature per status comes from
  // STATUS_HEAD_MOTION (bursts for success, jitter for error, etc.).

  // Veil opacity — modulates how much the rainbow shows through. Range now
  // driven by status config: error/success dip much further so peaks read
  // vivid; ambient barely dips at all.
  const veilPhase = useMotionValue(0);
  const [veilMin, veilMax] = prismConfig.veilRange;
  const veilOpacity = useTransform(
    veilPhase,
    (t: number) => veilMin + (veilMax - veilMin) * t,
  );

  // Aberration offset pulses subtly — the fringe "breathes" with the veil
  // so the iridescence quality shifts over time. Magnitude scales with
  // status config (more aberration on dramatic states).
  const aberrationMag = useTransform(
    veilPhase,
    (t: number) => prismConfig.aberration * (0.6 + 0.4 * (1 - t)),
  );

  // Glow breath — halo fades in/out on its OWN motion value, cycle length =
  // base-breath × φ (1.618). Coprime rhythm; plus opacity range dropped
  // (0.28-0.52 → 0.12-0.30) so the glow reads as atmospheric aura rather
  // than a solid secondary ring.
  const glowPhase = useMotionValue(0);
  const haloOpacity = useTransform(glowPhase, (t: number) => 0.12 + t * 0.18);

  // Ouroboros head — a bright specular bloom rides the ring at one rotating
  // point, followed by a dim "mouth" sliver just behind it. Together they
  // read as the serpent's head catching light with the bite directly beneath
  // it. Rotation rate independent of the rainbow drift so head and spectrum
  // don't sync.
  const headRotation = useMotionValue(0);
  // Radial aberration — red ghost renders at R+Δ (outside), cyan at R−Δ
  // (inside). Different wavelengths refract different amounts through a
  // prism; red bends least (outermost), violet most (innermost). Scale
  // transform is chosen over direct radius animation for GPU compositing.
  const aberrationScaleOut = useTransform(
    aberrationMag,
    (v: number) => 1 + v / RING_R,
  );
  const aberrationScaleIn = useTransform(
    aberrationMag,
    (v: number) => 1 - v / RING_R,
  );

  // Legacy prism hue kept for the non-prism base cases (smooth hue on the
  // base ring when motion is off, or small-size renders). Still cycles but
  // the primary visual is now the rainbow gradient.
  const prismHue = useMotionValue(0);
  const prismColor = useTransform(
    prismHue,
    (h: number) => `oklch(${PRISM_LIGHTNESS} ${PRISM_CHROMA} ${h.toFixed(1)})`,
  );

  useEffect(() => {
    if (!shouldBreathe) {
      breath.set(0);
      return;
    }
    // Idle: 10s cycle, near-imperceptible. Active: 5s (visibly alive without
    // being anxious). Thinking: 3s (faster metabolism).
    const duration = isThinking ? 3 : isActive ? 5 : 10;
    const controls = animate(breath, [0, 1, 0], {
      duration,
      repeat: Infinity,
      ease: 'easeInOut',
    });
    return () => controls.stop();
  }, [shouldBreathe, isActive, isThinking, breath]);

  useEffect(() => {
    if (!shouldPrism) {
      prismHue.set(0);
      veilPhase.set(0);
      glowPhase.set(0);
      headRotation.set(0);
      return;
    }
    const hueCtrl = animate(prismHue, 360, {
      duration: PRISM_CYCLE_DURATION,
      repeat: Infinity,
      ease: 'linear',
    });
    const veilCtrl = animate(veilPhase, [0, 1, 0], {
      duration: prismConfig.cycleS,
      repeat: Infinity,
      ease: 'easeInOut',
    });
    // Glow cycle at φ × veil cycle — coprime rhythm so the halo breath
    // doesn't sync with the veil's spectrum reveal.
    const PHI = 1.618;
    const glowCtrl = animate(glowPhase, [0, 1, 0], {
      duration: prismConfig.cycleS * PHI,
      repeat: Infinity,
      ease: 'easeInOut',
    });
    // Head motion drives the whole mark body. Each status has its own
    // motion signature so the mark communicates state through motion.
    const headMotion = STATUS_HEAD_MOTION[status] ?? STATUS_HEAD_MOTION.idle;
    const headCtrl = headMotion.keyframes
      ? animate(headRotation, headMotion.keyframes, {
          duration: headMotion.duration,
          ease: headMotion.ease,
          times: headMotion.times,
          repeat: Infinity,
          repeatType: headMotion.repeatType,
        })
      : animate(headRotation, headMotion.target ?? 360, {
          duration: headMotion.duration,
          ease: headMotion.ease,
          repeat: Infinity,
        });
    return () => {
      hueCtrl.stop();
      veilCtrl.stop();
      glowCtrl.stop();
      headCtrl.stop();
    };
  }, [shouldPrism, prismHue, veilPhase, glowPhase, headRotation, prismConfig.cycleS, status]);

  // Static stroke for success/error brief states + the dot target colors.
  const successBrighten = isSuccess ? 1 : isError ? 1 : 1;

  // Base ring opacity dims slightly while the traveling segment is visible,
  // so the segment reads as "brighter" without introducing a second hue.
  const baseOpacity = shouldTravelSegment ? 0.55 : 1;
  const segmentOpacity = shouldRotateShimmer ? 1 : isActive ? 0.95 : 0;

  return (
    <div
      data-aion-mark
      role="img"
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center shrink-0 ${className ?? ''}`.trim()}
      style={{ width: px, height: px, overflow: 'visible' }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 40 40"
        className="block"
        aria-hidden="true"
        overflow="visible"
        style={{ overflow: 'visible' }}
      >
        {/* Base ring — the fallback ring surface. Only visible when prism
            is off (reduced motion / small sizes / success / error / ambient).
            When prism is active the veil handles the "reads as white"
            surface; rendering the base on top of that produces a visible
            secondary ring outside the rainbow stack (which reads as error). */}
        {!shouldPrism && (
          <motion.circle
            cx={CX}
            cy={CY}
            r={RING_R}
            fill="none"
            stroke={fill}
            strokeWidth={shouldBreathe ? ringStroke : RING_STROKE_BASE}
            strokeLinecap="round"
            animate={{ opacity: baseOpacity * successBrighten }}
            transition={SETTLE_SPRING}
          />
        )}

        {/* Traveling segment — only on loading/thinking. Rotates around
            the center. Dasharray carves a ~60° arc; the remainder is gap. */}
        {motionAllowed && isActive && (
          <motion.circle
            cx={CX}
            cy={CY}
            r={RING_R}
            fill="none"
            stroke={shouldPrism ? prismColor : fill}
            strokeWidth={RING_STROKE_BASE}
            strokeLinecap="round"
            strokeDasharray={`${SEGMENT_LEN} ${SEGMENT_GAP}`}
            style={{
              transformOrigin: `${CX}px ${CY}px`,
              opacity: segmentOpacity,
            }}
            animate={{ rotate: 360 }}
            transition={shouldRotateShimmer ? SEGMENT_ROTATION_FAST : SEGMENT_ROTATION_SLOW}
          />
        )}

        {/* Prism dispersion — one ordered ROYGBIV rainbow ring, rotated
            slowly so the spectrum flows around the circumference. */}
        {shouldPrism && (
          <>
            {/* Status-biased gradient palette. Each gradient has the same
                structural shape (7 ordered stops across the spectrum) but
                the hue selection + chroma emphasis varies by status. */}
            <defs>
              {/* Idle / loading — balanced ROYGBIV. */}
              <linearGradient id="aion-prism-idle" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
                <stop offset="0"    stopColor="oklch(0.78 0.22 20)"  />
                <stop offset="0.17" stopColor="oklch(0.82 0.22 60)"  />
                <stop offset="0.33" stopColor="oklch(0.88 0.22 100)" />
                <stop offset="0.5"  stopColor="oklch(0.78 0.22 150)" />
                <stop offset="0.67" stopColor="oklch(0.72 0.22 220)" />
                <stop offset="0.83" stopColor="oklch(0.68 0.22 280)" />
                <stop offset="1"    stopColor="oklch(0.72 0.22 340)" />
              </linearGradient>

              {/* Thinking — cool bias. Violets, indigos, blues, cyans dominant. */}
              <linearGradient id="aion-prism-thinking" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
                <stop offset="0"    stopColor="oklch(0.75 0.24 260)" />
                <stop offset="0.17" stopColor="oklch(0.70 0.25 220)" />
                <stop offset="0.33" stopColor="oklch(0.76 0.22 195)" />
                <stop offset="0.5"  stopColor="oklch(0.80 0.20 175)" />
                <stop offset="0.67" stopColor="oklch(0.72 0.24 250)" />
                <stop offset="0.83" stopColor="oklch(0.65 0.26 285)" />
                <stop offset="1"    stopColor="oklch(0.70 0.24 310)" />
              </linearGradient>

              {/* Success — green bias. Greens, yellow-greens, cyans dominant. */}
              <linearGradient id="aion-prism-success" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
                <stop offset="0"    stopColor="oklch(0.88 0.22 120)" />
                <stop offset="0.17" stopColor="oklch(0.82 0.26 140)" />
                <stop offset="0.33" stopColor="oklch(0.78 0.24 155)" />
                <stop offset="0.5"  stopColor="oklch(0.82 0.22 175)" />
                <stop offset="0.67" stopColor="oklch(0.85 0.24 145)" />
                <stop offset="0.83" stopColor="oklch(0.80 0.26 130)" />
                <stop offset="1"    stopColor="oklch(0.88 0.22 120)" />
              </linearGradient>

              {/* Error — red/amber bias. Reds, oranges, ambers dominant. */}
              <linearGradient id="aion-prism-error" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
                <stop offset="0"    stopColor="oklch(0.68 0.26 25)"  />
                <stop offset="0.17" stopColor="oklch(0.74 0.22 40)"  />
                <stop offset="0.33" stopColor="oklch(0.80 0.20 60)"  />
                <stop offset="0.5"  stopColor="oklch(0.72 0.24 50)"  />
                <stop offset="0.67" stopColor="oklch(0.65 0.27 20)"  />
                <stop offset="0.83" stopColor="oklch(0.70 0.26 10)"  />
                <stop offset="1"    stopColor="oklch(0.68 0.26 25)"  />
              </linearGradient>

              {/* Ambient — desaturated, low chroma. Barely-there. */}
              <linearGradient id="aion-prism-ambient" gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
                <stop offset="0"    stopColor="oklch(0.78 0.04 20)"  />
                <stop offset="0.33" stopColor="oklch(0.82 0.04 120)" />
                <stop offset="0.67" stopColor="oklch(0.78 0.04 220)" />
                <stop offset="1"    stopColor="oklch(0.80 0.04 320)" />
              </linearGradient>
            </defs>

            {/* The whole serpent rotates as one body. Rainbow layers,
                aberrations, and head all share one rotation so the mark
                moves as a unit — the ring visibly spins rather than having
                a dot riding on a static ring. Each status's motion
                signature (from STATUS_HEAD_MOTION) drives the whole thing. */}
            <motion.g
              style={{
                transformOrigin: `${CX}px ${CY}px`,
                rotate: headRotation,
              }}
            >
              {/* Rainbow halo — soft glow layer. Opacity breathes on the
                  glow-phase cycle (coprime with base breath). Single glow
                  layer now — the prior "bleed" layer was redundant additive
                  mass producing one effect (bloom). */}
              <motion.circle
                cx={CX}
                cy={CY}
                r={RING_R}
                fill="none"
                stroke={`url(#aion-prism-${prismConfig.gradientId})`}
                strokeWidth={RAINBOW_STROKE_HALO}
                strokeLinecap="round"
                style={{
                  mixBlendMode: 'plus-lighter',
                  filter: `blur(${RAINBOW_BLUR_HALO}px)`,
                  opacity: haloOpacity,
                }}
              />

              {/* Rainbow core — sharp. The spectrum's actual path. */}
              <motion.circle
                cx={CX}
                cy={CY}
                r={RING_R}
                fill="none"
                stroke={`url(#aion-prism-${prismConfig.gradientId})`}
                strokeWidth={RAINBOW_STROKE_CORE}
                strokeLinecap="round"
                style={{
                  mixBlendMode: 'plus-lighter',
                }}
              />

              {/* Radial chromatic aberration — red ghost outside (R+Δ). Red
                  wavelengths bend least through a prism → outermost position. */}
              <motion.circle
                cx={CX}
                cy={CY}
                r={RING_R}
                fill="none"
                stroke={isError ? 'oklch(0.78 0.24 35)' : isSuccess ? 'oklch(0.82 0.22 110)' : 'oklch(0.82 0.2 30)'}
                strokeWidth={RING_STROKE_BASE * 0.7}
                strokeLinecap="round"
                style={{
                  opacity: ABERRATION_OPACITY,
                  mixBlendMode: 'plus-lighter',
                  transformOrigin: `${CX}px ${CY}px`,
                  scale: aberrationScaleOut,
                  filter: 'blur(0.5px)',
                }}
              />

              {/* Radial chromatic aberration — cyan/violet ghost inside (R−Δ).
                  Shorter-wavelength light refracts more → innermost position. */}
              <motion.circle
                cx={CX}
                cy={CY}
                r={RING_R}
                fill="none"
                stroke={isError ? 'oklch(0.70 0.24 10)' : isSuccess ? 'oklch(0.82 0.22 170)' : 'oklch(0.72 0.24 260)'}
                strokeWidth={RING_STROKE_BASE * 0.7}
                strokeLinecap="round"
                style={{
                  opacity: ABERRATION_OPACITY,
                  mixBlendMode: 'plus-lighter',
                  transformOrigin: `${CX}px ${CY}px`,
                  scale: aberrationScaleIn,
                  filter: 'blur(0.5px)',
                }}
              />

              {/* Head cluster — gated on actual activity, per Critic:
                  "rest state that never rests" was the headline problem.
                  At idle / ambient / loading-with-no-user-action, the ring
                  stays a clean continuous mandala. Head appears only when
                  Aion is doing genuine work (thinking / success). */}
              {(isThinking || isSuccess) && (
                <>
                  <circle
                    cx={CX}
                    cy={CY - RING_R}
                    r={1.8}
                    fill="oklch(0.12 0 0)"
                    style={{
                      opacity: 0.7,
                      filter: 'blur(0.6px)',
                      transform: `rotate(8deg)`,
                      transformOrigin: `${CX}px ${CY}px`,
                    }}
                  />
                  <circle
                    cx={CX}
                    cy={CY - RING_R}
                    r={2.6}
                    fill="oklch(0.99 0.01 0)"
                    style={{
                      filter: 'blur(1.2px)',
                      opacity: 0.9,
                      mixBlendMode: 'plus-lighter',
                    }}
                  />
                  <circle
                    cx={CX}
                    cy={CY - RING_R}
                    r={0.9}
                    fill="oklch(1 0 0)"
                    style={{
                      opacity: 0.95,
                      mixBlendMode: 'plus-lighter',
                    }}
                  />
                </>
              )}
            </motion.g>

            {/* White veil — modulates how much of the rainbow stack reads
                through. Stroke widened (3.2 → 5) so it fully occludes the
                halo layer (stroke 4) during high-veil moments. Previously
                the halo leaked past the narrower veil, preventing true
                "reads as white" resolution. */}
            <motion.circle
              cx={CX}
              cy={CY}
              r={RING_R}
              fill="none"
              stroke="oklch(0.98 0.005 0)"
              strokeWidth={5}
              strokeLinecap="round"
              style={{ opacity: veilOpacity }}
            />
          </>
        )}

        {/* Center mark — the Self. Pulses in counterpoint to the ring's
            breath (dot grows as the ring's stroke thickens, reinforcing
            the mandala symbolism: center and perimeter as one gesture). */}
        <motion.circle
          cx={CX}
          cy={CY}
          r={shouldBreathe ? dotRadius : DOT_R_REST}
          fill={shouldPrism ? prismColor : fill}
          animate={{
            opacity: isError ? [1, 0.4, 1] : 1,
          }}
          transition={
            isError
              ? { duration: 0.6, repeat: 1, ease: 'easeOut' }
              : SETTLE_SPRING
          }
        />
      </svg>
    </div>
  );
}


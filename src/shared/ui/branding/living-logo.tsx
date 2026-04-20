'use client';

import { useEffect, useId, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Phase Mark — The Unusonic Vesica
 *
 * Two identical circles share the classical vesica piscis: each circle's
 * center sits on the other's perimeter. The almond-shaped overlap is the
 * coniunctio — where psyche and matter, people and logistics, resolve as
 * one underlying ground. The circles hold the tension. The lens holds the
 * product.
 *
 * Color stack ported from the Aion Mark so the two marks read as siblings:
 *   1. Rainbow halo (wide stroke, heavy blur, plus-lighter) — atmospheric aura
 *   2. Rainbow core (sharp stroke, plus-lighter) — the spectrum path
 *   3. Radial chromatic aberration — red ghost outside at R+Δ (bends least),
 *      cyan/violet ghost inside at R−Δ (bends most)
 *   4. White veil on top; its opacity pulses between reads-as-white and
 *      rainbow-reveals. Same cycle on both rings so the reveal is shared.
 *
 * Living signature — interference bloom: when both rings hit their veil
 * minimum together and the separation is near alignment, the lens saturates
 * with rainbow rim. Two refractions, one shared brilliance.
 */

// ─── Geometry (viewBox 40×40, center 20,20) ─────────────────────────────────
const CX = 20;
const CY = 20;
const VESICA_R = 10.5;
const RING_CORE = 2.2;
const RING_HALO = 5.5;
const RING_HALO_BLUR = 3.2;
const LENS_W = 2.6;
const ABERRATION_OPACITY = 0.38;

// Motion below this rendered size is suppressed entirely; sub-32px motion
// reads as noise rather than as living animation.
const MIN_ANIMATED_PX = 32;

// ─── Sizes ──────────────────────────────────────────────────────────────────
const SIZE_MAP = { sm: 24, md: 40, lg: 56, xl: 80 } as const;

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

// ─── Per-status prism config ────────────────────────────────────────────────
// veilRange: [peak-rainbow-reveal, reads-as-white]
// sepRange:  [min separation, max separation] — classical vesica = R
type StatusConfig = {
  gradientId: 'idle' | 'thinking' | 'success' | 'error' | 'ambient';
  veilRange: [number, number];
  cycleS: number;
  aberration: number;
  sepRange: [number, number];
  sepPeriod: number;
  rotate: number;
  rotatePeriod: number;
  pulse?: boolean;
  jitter?: boolean;
};

const STATUS: Record<LivingLogoStatus, StatusConfig> = {
  idle: {
    gradientId: 'idle',
    veilRange: [0.58, 0.88],
    cycleS: 9,
    aberration: 0.22,
    sepRange: [VESICA_R * 0.98, VESICA_R * 1.02],
    sepPeriod: 11,
    rotate: 0, rotatePeriod: 0,
  },
  loading: {
    gradientId: 'idle',
    veilRange: [0.52, 0.86],
    cycleS: 7,
    aberration: 0.28,
    sepRange: [VESICA_R * 0.55, VESICA_R * 1.05],
    sepPeriod: 5,
    rotate: 0, rotatePeriod: 0,
  },
  thinking: {
    gradientId: 'thinking',
    veilRange: [0.42, 0.82],
    cycleS: 4.5,
    aberration: 0.38,
    sepRange: [VESICA_R * 0.85, VESICA_R * 1.05],
    sepPeriod: 3.5,
    rotate: 360, rotatePeriod: 12,
  },
  success: {
    gradientId: 'success',
    veilRange: [0.22, 0.72],
    cycleS: 3.5,
    aberration: 0.45,
    sepRange: [0.15 * VESICA_R, 0.15 * VESICA_R],
    sepPeriod: 0,
    rotate: 0, rotatePeriod: 0,
    pulse: true,
  },
  error: {
    gradientId: 'error',
    veilRange: [0.22, 0.58],
    cycleS: 2.4,
    aberration: 0.55,
    sepRange: [VESICA_R * 1.55, VESICA_R * 1.55],
    sepPeriod: 0,
    rotate: 0, rotatePeriod: 0,
    jitter: true,
  },
  ambient: {
    gradientId: 'ambient',
    veilRange: [0.78, 0.94],
    cycleS: 14,
    aberration: 0.12,
    sepRange: [VESICA_R, VESICA_R],
    sepPeriod: 0,
    rotate: 0, rotatePeriod: 0,
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function buildLensPath(cxL: number, cxR: number, r: number): string {
  const sep = cxR - cxL;
  if (sep <= 0.01) {
    return `M ${cxL - r} ${CY} A ${r} ${r} 0 1 0 ${cxL + r} ${CY} A ${r} ${r} 0 1 0 ${cxL - r} ${CY} Z`;
  }
  if (sep >= 2 * r) return '';
  const halfH = Math.sqrt(r * r - (sep / 2) * (sep / 2));
  const topX = (cxL + cxR) / 2;
  const topY = CY - halfH;
  const botY = CY + halfH;
  return `M ${topX} ${topY} A ${r} ${r} 0 0 1 ${topX} ${botY} A ${r} ${r} 0 0 1 ${topX} ${topY} Z`;
}

// ─── Prism gradients (status-biased ROYGBIV, same palette as Aion) ──────────
function PrismDefs({ uid }: { uid: string }) {
  return (
    <defs>
      <linearGradient id={`vesica-prism-idle-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
        <stop offset="0"    stopColor="oklch(0.78 0.22 20)"  />
        <stop offset="0.17" stopColor="oklch(0.82 0.22 60)"  />
        <stop offset="0.33" stopColor="oklch(0.88 0.22 100)" />
        <stop offset="0.5"  stopColor="oklch(0.78 0.22 150)" />
        <stop offset="0.67" stopColor="oklch(0.72 0.22 220)" />
        <stop offset="0.83" stopColor="oklch(0.68 0.22 280)" />
        <stop offset="1"    stopColor="oklch(0.72 0.22 340)" />
      </linearGradient>

      <linearGradient id={`vesica-prism-thinking-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
        <stop offset="0"    stopColor="oklch(0.75 0.24 260)" />
        <stop offset="0.17" stopColor="oklch(0.70 0.25 220)" />
        <stop offset="0.33" stopColor="oklch(0.76 0.22 195)" />
        <stop offset="0.5"  stopColor="oklch(0.80 0.20 175)" />
        <stop offset="0.67" stopColor="oklch(0.72 0.24 250)" />
        <stop offset="0.83" stopColor="oklch(0.65 0.26 285)" />
        <stop offset="1"    stopColor="oklch(0.70 0.24 310)" />
      </linearGradient>

      <linearGradient id={`vesica-prism-success-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
        <stop offset="0"    stopColor="oklch(0.88 0.22 120)" />
        <stop offset="0.17" stopColor="oklch(0.82 0.26 140)" />
        <stop offset="0.33" stopColor="oklch(0.78 0.24 155)" />
        <stop offset="0.5"  stopColor="oklch(0.82 0.22 175)" />
        <stop offset="0.67" stopColor="oklch(0.85 0.24 145)" />
        <stop offset="0.83" stopColor="oklch(0.80 0.26 130)" />
        <stop offset="1"    stopColor="oklch(0.88 0.22 120)" />
      </linearGradient>

      <linearGradient id={`vesica-prism-error-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
        <stop offset="0"    stopColor="oklch(0.68 0.26 25)"  />
        <stop offset="0.17" stopColor="oklch(0.74 0.22 40)"  />
        <stop offset="0.33" stopColor="oklch(0.80 0.20 60)"  />
        <stop offset="0.5"  stopColor="oklch(0.72 0.24 50)"  />
        <stop offset="0.67" stopColor="oklch(0.65 0.27 20)"  />
        <stop offset="0.83" stopColor="oklch(0.70 0.26 10)"  />
        <stop offset="1"    stopColor="oklch(0.68 0.26 25)"  />
      </linearGradient>

      <linearGradient id={`vesica-prism-ambient-${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="40" y2="20">
        <stop offset="0"    stopColor="oklch(0.78 0.04 20)"  />
        <stop offset="0.33" stopColor="oklch(0.82 0.04 120)" />
        <stop offset="0.67" stopColor="oklch(0.78 0.04 220)" />
        <stop offset="1"    stopColor="oklch(0.80 0.04 320)" />
      </linearGradient>

      <filter id={`vesica-bloom-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="0.7" />
      </filter>
    </defs>
  );
}

// ─── PrismRing — one circle carrying the full Aion color stack ──────────────
function PrismRing({
  cx, cy, r, uid, gradientId, veilOp, aberration, isError, isSuccess,
}: {
  cx: number; cy: number; r: number; uid: string;
  gradientId: StatusConfig['gradientId'];
  veilOp: number; aberration: number;
  isError: boolean; isSuccess: boolean;
}) {
  const scaleOut = 1 + aberration / r;
  const scaleIn = 1 - aberration / r;
  const redGhost = isError
    ? 'oklch(0.78 0.24 35)'
    : isSuccess ? 'oklch(0.82 0.22 110)' : 'oklch(0.82 0.2 30)';
  const violetGhost = isError
    ? 'oklch(0.70 0.24 10)'
    : isSuccess ? 'oklch(0.82 0.22 170)' : 'oklch(0.72 0.24 260)';

  return (
    <g>
      {/* Halo — wide + blurred so outer glow reads as aura, not a second ring */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={`url(#vesica-prism-${gradientId}-${uid})`}
        strokeWidth={RING_HALO}
        strokeLinecap="round"
        style={{
          mixBlendMode: 'plus-lighter',
          filter: `blur(${RING_HALO_BLUR}px)`,
          opacity: 0.7,
        }}
      />
      {/* Rainbow core — sharp spectrum */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={`url(#vesica-prism-${gradientId}-${uid})`}
        strokeWidth={RING_CORE}
        strokeLinecap="round"
        style={{ mixBlendMode: 'plus-lighter' }}
      />
      {/* Red ghost outside (R+Δ) — longest wavelength bends least */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={redGhost}
        strokeWidth={RING_CORE * 0.55}
        strokeLinecap="round"
        style={{
          opacity: ABERRATION_OPACITY,
          mixBlendMode: 'plus-lighter',
          transformOrigin: `${cx}px ${cy}px`,
          transform: `scale(${scaleOut})`,
          filter: 'blur(0.35px)',
        }}
      />
      {/* Cyan/violet ghost inside (R−Δ) — shortest wavelength bends most */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={violetGhost}
        strokeWidth={RING_CORE * 0.55}
        strokeLinecap="round"
        style={{
          opacity: ABERRATION_OPACITY,
          mixBlendMode: 'plus-lighter',
          transformOrigin: `${cx}px ${cy}px`,
          transform: `scale(${scaleIn})`,
          filter: 'blur(0.35px)',
        }}
      />
      {/* White veil — opacity modulates between reads-as-white and rainbow-reveal */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="oklch(0.98 0.005 0)"
        strokeWidth={RING_CORE * 1.2}
        strokeLinecap="round"
        style={{ opacity: veilOp }}
      />
    </g>
  );
}

// ─── Status fills used for the static (non-animated) fallback ───────────────
const STATIC_STROKE: Record<LivingLogoStatus, string> = {
  idle:     'var(--stage-accent, oklch(1 0 0))',
  loading:  'var(--stage-accent, oklch(1 0 0))',
  thinking: 'var(--stage-accent, oklch(1 0 0))',
  success:  'var(--color-unusonic-success, oklch(0.75 0.18 145))',
  error:    'var(--color-unusonic-error, oklch(0.70 0.18 20))',
  ambient:  'var(--stage-text-secondary, oklch(0.60 0 0))',
};

// ─── Component ──────────────────────────────────────────────────────────────
export function LivingLogo({
  status = 'idle',
  size = 'md',
  className,
}: LivingLogoProps) {
  const rawId = useId().replace(/:/g, '');
  const prefersReducedMotion = useReducedMotion();
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const cfg = STATUS[status] ?? STATUS.idle;
  const motionAllowed = !prefersReducedMotion && px >= MIN_ANIMATED_PX;

  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!motionAllowed) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      setNow((t - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [motionAllowed]);

  // Static fallback: two crisp circles + lens seam at classical vesica (sep = R).
  if (!motionAllowed) {
    const stroke = STATIC_STROKE[status] ?? STATIC_STROKE.idle;
    const cxL = CX - VESICA_R / 2;
    const cxR = CX + VESICA_R / 2;
    const staticLens = buildLensPath(cxL, cxR, VESICA_R);
    return (
      <div
        data-living-logo
        role="img"
        aria-hidden="true"
        className={`relative inline-flex items-center justify-center shrink-0 ${className ?? ''}`.trim()}
        style={{ width: px, height: px, overflow: 'visible' }}
      >
        <svg width={px} height={px} viewBox="0 0 40 40" className="block" style={{ overflow: 'visible' }}>
          <circle cx={cxL} cy={CY} r={VESICA_R} fill="none" stroke={stroke} strokeWidth={RING_CORE} />
          <circle cx={cxR} cy={CY} r={VESICA_R} fill="none" stroke={stroke} strokeWidth={RING_CORE} />
          {staticLens && (
            <path d={staticLens} fill="none" stroke={stroke} strokeWidth={LENS_W} opacity={0.9} />
          )}
        </svg>
      </div>
    );
  }

  // ── Animated derivations ──────────────────────────────────────────────────
  // Separation
  let sep = cfg.sepRange[0];
  if (cfg.sepPeriod > 0) {
    const p = 0.5 - 0.5 * Math.cos((now / cfg.sepPeriod) * Math.PI * 2);
    sep = lerp(cfg.sepRange[0], cfg.sepRange[1], p);
  }

  // Veil opacity — shared cycle so interference fires simultaneously
  const [vMin, vMax] = cfg.veilRange;
  let veilOp = (vMin + vMax) / 2;
  let veilPhase = 0;
  if (cfg.cycleS > 0) {
    const p = 0.5 - 0.5 * Math.cos((now / cfg.cycleS) * Math.PI * 2);
    veilOp = lerp(vMin, vMax, p);
    veilPhase = p;
  }

  // Aberration — counter-phase with veil so fringe breathes with the reveal
  const aberration = cfg.aberration * (0.6 + 0.4 * (1 - veilPhase));

  // Rotation (thinking only)
  let rotate = 0;
  if (cfg.rotate && cfg.rotatePeriod > 0) {
    rotate = ((now / cfg.rotatePeriod) % 1) * cfg.rotate;
  }

  // Success pulse — exponentially decaying sinusoid, 1.8s period
  let successScale = 1;
  if (cfg.pulse) {
    const t = (now % 1.8) / 1.8;
    successScale = 1 + 0.08 * Math.exp(-t * 5) * Math.sin(t * 18);
  }

  // Error jitter — tiny decaying shake on a 2s cycle
  let jitterX = 0;
  if (cfg.jitter) {
    const t = (now % 2.0) / 2.0;
    jitterX = 0.5 * Math.exp(-t * 3) * Math.sin(t * 36);
  }

  const cxL = CX - sep / 2 + jitterX;
  const cxR = CX + sep / 2 + jitterX;
  const lensPath = buildLensPath(cxL, cxR, VESICA_R);

  // Interference bloom — peaks when veilPhase is near 0 (max rainbow reveal)
  // and weighted by alignment proximity (small sep → high proximity).
  let bloomOp = 0;
  if (cfg.cycleS > 0) {
    const b = Math.exp(-(veilPhase * veilPhase) / (2 * 0.28 * 0.28));
    const minSep = Math.min(...cfg.sepRange);
    const maxSep = Math.max(...cfg.sepRange);
    const prox = maxSep > minSep + 0.01 ? 1 - (sep - minSep) / (maxSep - minSep) : 0.6;
    bloomOp = clamp(b * (0.45 + 0.55 * prox), 0, 1);
  }

  const baseStroke = 'oklch(0.98 0.005 0)';

  return (
    <div
      data-living-logo
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
        overflow="visible"
        style={{ overflow: 'visible' }}
      >
        <PrismDefs uid={rawId} />
        <g
          style={{
            transformOrigin: '20px 20px',
            transform: `rotate(${rotate}deg) scale(${successScale})`,
          }}
        >
          <PrismRing
            cx={cxL} cy={CY} r={VESICA_R}
            uid={rawId}
            gradientId={cfg.gradientId}
            veilOp={veilOp}
            aberration={aberration}
            isError={status === 'error'}
            isSuccess={status === 'success'}
          />
          <PrismRing
            cx={cxR} cy={CY} r={VESICA_R}
            uid={rawId}
            gradientId={cfg.gradientId}
            veilOp={veilOp}
            aberration={aberration}
            isError={status === 'error'}
            isSuccess={status === 'success'}
          />

          {lensPath && (
            <>
              {/* Base lens fill — subtle tint, brightens during bloom */}
              <path d={lensPath} fill={baseStroke} opacity={0.06 + 0.18 * bloomOp} />
              {/* Lens seam — always crisp white */}
              <path
                d={lensPath}
                fill="none"
                stroke={baseStroke}
                strokeWidth={LENS_W}
                strokeLinecap="round"
                opacity={0.92}
              />
              {/* Bloom — rainbow rim on the lens when both rings reveal together */}
              {bloomOp > 0.05 && (
                <path
                  d={lensPath}
                  fill="none"
                  stroke={`url(#vesica-prism-${cfg.gradientId}-${rawId})`}
                  strokeWidth={LENS_W * 0.85}
                  opacity={bloomOp * 0.9}
                  filter={`url(#vesica-bloom-${rawId})`}
                  style={{ mixBlendMode: 'plus-lighter' }}
                />
              )}
            </>
          )}
        </g>
      </svg>
    </div>
  );
}

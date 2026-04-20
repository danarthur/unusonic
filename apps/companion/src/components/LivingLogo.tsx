import { useEffect, useState } from 'react';

/**
 * Phase Mark — Unusonic Vesica, standalone (no Framer Motion, no prism).
 *
 * Simplified version for the companion app. Two overlapping circles at
 * classical vesica separation (sep = R). Loading / syncing states drift
 * the separation in/out to show activity. Status colors map to single
 * flat strokes.
 *
 * Geometry matches `src/shared/ui/branding/living-logo.tsx`:
 *   viewBox 40×40, R = 10.5, sep = R.
 */

type LogoStatus = 'idle' | 'loading' | 'syncing' | 'success' | 'error';

const SIZE_MAP = { sm: 24, md: 40, lg: 56 };

const STROKES: Record<LogoStatus, string> = {
  idle:    'oklch(1 0 0)',
  loading: 'oklch(1 0 0)',
  syncing: 'oklch(1 0 0)',
  success: 'oklch(0.75 0.18 145)',
  error:   'oklch(0.65 0.18 20)',
};

const R = 10.5;
const CY = 20;
const CX = 20;
const RING_W = 2.2;
const LENS_W = 2.6;

interface LivingLogoProps {
  status?: LogoStatus;
  size?: keyof typeof SIZE_MAP | number;
}

function buildLens(sep: number): string {
  if (sep <= 0.01 || sep >= 2 * R) return '';
  const halfH = Math.sqrt(R * R - (sep / 2) * (sep / 2));
  const topX = CX;
  const topY = CY - halfH;
  const botY = CY + halfH;
  return `M ${topX} ${topY} A ${R} ${R} 0 0 1 ${topX} ${botY} A ${R} ${R} 0 0 1 ${topX} ${topY} Z`;
}

export function LivingLogo({ status = 'idle', size = 'md' }: LivingLogoProps) {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const stroke = STROKES[status];
  const isAnimating = status === 'loading' || status === 'syncing';

  // Separation drift — at classical vesica sep = R. Loading widens and
  // narrows on a 5s cycle; syncing on a tighter 2.4s cycle.
  const [sep, setSep] = useState(R);

  useEffect(() => {
    if (!isAnimating) {
      setSep(status === 'success' ? R * 0.2 : status === 'error' ? R * 1.5 : R);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const duration = status === 'syncing' ? 2400 : 5000;
    const tick = (now: number) => {
      const t = ((now - start) % duration) / duration;
      const wave = Math.sin(t * Math.PI * 2);
      setSep(R + wave * R * 0.35);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isAnimating, status]);

  const cxL = CX - sep / 2;
  const cxR = CX + sep / 2;
  const lens = buildLens(sep);

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 40 40"
      style={{
        display: 'block',
        transition: isAnimating ? 'none' : 'all 0.3s ease',
      }}
    >
      <circle cx={cxL} cy={CY} r={R} fill="none" stroke={stroke} strokeWidth={RING_W} />
      <circle cx={cxR} cy={CY} r={R} fill="none" stroke={stroke} strokeWidth={RING_W} />
      {lens && (
        <path
          d={lens}
          fill="none"
          stroke={stroke}
          strokeWidth={LENS_W}
          strokeLinecap="round"
          opacity={0.92}
        />
      )}
    </svg>
  );
}

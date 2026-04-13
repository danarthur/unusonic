import { useEffect, useState } from 'react';

/**
 * Phase Mark — The Unusonic Living Logo (standalone, no Framer Motion dependency).
 * Simplified version for the companion app using CSS animations.
 * Two offset pills that breathe during loading states.
 */

type LogoStatus = 'idle' | 'loading' | 'syncing' | 'success' | 'error';

const SIZE_MAP = { sm: 24, md: 40, lg: 56 };

const FILLS: Record<LogoStatus, string> = {
  idle:    'oklch(1 0 0)',
  loading: 'oklch(1 0 0)',
  syncing: 'oklch(1 0 0)',
  success: 'oklch(0.75 0.18 145)',
  error:   'oklch(0.65 0.18 20)',
};

interface LivingLogoProps {
  status?: LogoStatus;
  size?: keyof typeof SIZE_MAP | number;
}

export function LivingLogo({ status = 'idle', size = 'md' }: LivingLogoProps) {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const fill = FILLS[status];
  const isAnimating = status === 'loading' || status === 'syncing';

  // Tidal drift offset animation via state
  const [offset, setOffset] = useState(4);

  useEffect(() => {
    if (!isAnimating) {
      setOffset(status === 'success' ? 0.5 : status === 'error' ? 7 : 4);
      return;
    }

    let frame: number;
    const start = performance.now();
    const duration = status === 'syncing' ? 2400 : 5000;

    const animate = (now: number) => {
      const t = ((now - start) % duration) / duration;
      // Ease in-out sine oscillation between 1 and 4
      const wave = Math.sin(t * Math.PI * 2);
      setOffset(4 + wave * -3); // oscillates 1 ↔ 7
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [isAnimating, status]);

  const centerY = 20;
  const pillH = 6;

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
      {/* Left pill (higher) */}
      <rect
        x={5}
        y={centerY - pillH / 2 - offset / 2}
        width={14}
        height={pillH}
        rx={3}
        fill={fill}
        style={{ transition: isAnimating ? 'none' : 'y 0.4s ease, fill 0.3s' }}
      />
      {/* Right pill (lower) */}
      <rect
        x={21}
        y={centerY - pillH / 2 + offset / 2}
        width={14}
        height={pillH}
        rx={3}
        fill={fill}
        style={{ transition: isAnimating ? 'none' : 'y 0.4s ease, fill 0.3s' }}
      />
    </svg>
  );
}

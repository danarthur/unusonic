'use client';

import { useId } from 'react';
import { motion } from 'framer-motion';

// --- DESIGN SYSTEM: Liquid Glass on Void ---
// One orb. Ceramic/neon tokens. No flat gray, no literal white ring.
const SIZE_MAP = { sm: 24, md: 40, lg: 56, xl: 80 } as const;

// Gradient stop colors per status (OKLCH-backed via CSS vars for luxury feel)
const STATUS_GRADIENTS: Record<
  string,
  { specular: string; body: string; rim: string }
> = {
  idle: {
    specular: 'var(--color-ceramic)',
    body: 'oklch(0.96 0.005 95)', // warm ceramic body
    rim: 'oklch(0.75 0.02 95)', // darker warm rim
  },
  loading: {
    specular: 'var(--color-ceramic)',
    body: 'oklch(0.85 0.08 250)',
    rim: 'oklch(0.55 0.15 250)',
  },
  thinking: {
    specular: 'var(--color-ceramic)',
    body: 'oklch(0.85 0.08 250)',
    rim: 'oklch(0.55 0.15 250)',
  },
  success: {
    specular: 'oklch(0.98 0.02 145)',
    body: 'var(--color-signal-success)',
    rim: 'oklch(0.50 0.15 145)',
  },
  error: {
    specular: 'oklch(0.95 0.05 20)',
    body: 'var(--color-signal-error)',
    rim: 'oklch(0.45 0.18 20)',
  },
  ambient: {
    specular: 'oklch(0.92 0 0)',
    body: 'oklch(0.82 0.01 0)',
    rim: 'oklch(0.55 0.02 0)',
  },
};

// Organic "Bouba" — soft squircle, not a default circle
const ORGANIC_PATH =
  'M 20 5.5 C 30 5.5 34.5 10 34.5 20 C 34.5 30 30 34.5 20 34.5 C 10 34.5 5.5 30 5.5 20 C 5.5 10 10 5.5 20 5.5 Z';

const FLUX_PATH =
  'M 20 4 C 32 4 36 12 36 20 C 36 28 32 36 20 36 C 8 36 4 28 4 20 C 4 12 8 4 20 4 Z';

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

export function LivingLogo({
  status = 'idle',
  size = 'md',
  className,
}: LivingLogoProps) {
  const id = useId().replace(/:/g, '');
  const gradId = `logo-grad-${id}`;
  const glowId = `logo-glow-${id}`;

  const px = typeof size === 'number' ? size : SIZE_MAP[size];
  const colors = STATUS_GRADIENTS[status] ?? STATUS_GRADIENTS.idle;
  const isThinking = status === 'thinking' || status === 'loading';

  return (
    <div
      data-living-logo
      role="img"
      aria-hidden="true"
      className={`relative inline-flex items-center justify-center shrink-0 ${className ?? ''}`.trim()}
      style={{ width: px, height: px }}
    >
      <svg
        width={px}
        height={px}
        viewBox="0 0 40 40"
        className="overflow-visible block"
        aria-hidden="true"
      >
        <defs>
          {/* Single orb: lit top-left, body, darker rim (spherical volume) */}
          <radialGradient
            id={gradId}
            cx="28%"
            cy="28%"
            r="72%"
            fx="28%"
            fy="28%"
          >
            <stop offset="0%" stopColor={colors.specular} stopOpacity={1} />
            <stop offset="45%" stopColor={colors.body} stopOpacity={1} />
            <stop offset="100%" stopColor={colors.rim} stopOpacity={1} />
          </radialGradient>

          {/* Soft glow only — no displacement, no boxy artifact */}
          <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur
              in="SourceGraphic"
              stdDeviation="2"
              result="blur"
            />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* One shape: the liquid glass orb — guard d so it is never undefined */}
        <motion.path
          d={ORGANIC_PATH ?? 'M 20 20 L 20 20 Z'}
          fill={`url(#${gradId})`}
          filter={`url(#${glowId})`}
          stroke="oklch(1 0 0 / 0.12)"
          strokeWidth="0.6"
          strokeLinejoin="round"
          style={{ transformOrigin: '20px 20px' }}
          animate={{
            d: (isThinking ? FLUX_PATH : ORGANIC_PATH) ?? ORGANIC_PATH,
            rotate: isThinking ? 360 : 0,
            scale: status === 'idle' || status === 'ambient' ? [1, 1.04, 1] : 1,
          }}
          transition={{
            d: {
              duration: 1.2,
              repeat: isThinking ? Infinity : 0,
              repeatType: 'reverse',
              type: 'spring',
              stiffness: 80,
              damping: 18,
            },
            rotate: {
              duration: 4,
              repeat: isThinking ? Infinity : 0,
              ease: 'linear',
            },
            scale: {
              duration: 3.5,
              repeat: Infinity,
              repeatType: 'mirror',
              ease: 'easeInOut',
            },
          }}
        />
      </svg>
    </div>
  );
}

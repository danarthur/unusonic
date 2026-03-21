'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

interface LiquidPillProps extends HTMLMotionProps<'div'> {
  children?: React.ReactNode;
  className?: string;
}

/**
 * LiquidPill – Same liquid glass as DayBlade/overlay.
 * See-through effect: content behind visible but blurred, like looking through liquid.
 */
export function LiquidPill({
  children,
  className,
  layout,
  transition = { type: 'spring', stiffness: 300, damping: 30 },
  ...props
}: LiquidPillProps) {
  return (
    <motion.div
      layout={layout ?? true}
      transition={transition}
      initial={false}
      className={cn(
        'liquid-pill relative overflow-hidden rounded-[2rem]',
        /* Match DayBlade: glass-bg + backdrop-blur = liquid see-through */
        'bg-[var(--glass-bg)]',
        'backdrop-blur-2xl backdrop-saturate-[160%]',
        'border border-[var(--glass-border)]',
        'shadow-[var(--glass-shadow)]',
        className
      )}
      {...props}
    >
      {/* Subtle grain for texture */}
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.02] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </motion.div>
  );
}

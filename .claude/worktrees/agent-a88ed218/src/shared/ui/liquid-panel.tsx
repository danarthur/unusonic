'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import {
  M3_FADE_THROUGH_ENTER,
  M3_FADE_THROUGH_EXIT,
  SIGNAL_PHYSICS,
} from '@/shared/lib/motion-constants';

interface LiquidPanelProps extends HTMLMotionProps<"div"> {
  children?: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  /** Levitation: floats above grid (scale, deeper shadow) — medium urgency */
  levitate?: boolean;
  /** Subsurface ION glow: edge glows from within when ION has a contextual suggestion */
  ionHint?: boolean;
}

export function LiquidPanel({
  children = null,
  className,
  hoverEffect = false,
  levitate = false,
  ionHint = false,
  ...props
}: LiquidPanelProps) {
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: M3_FADE_THROUGH_EXIT }}
      transition={SIGNAL_PHYSICS}
      whileHover={hoverEffect && !levitate ? { y: -2, scale: 1.002 } : undefined}
      className={cn(
        "liquid-card p-6 relative overflow-hidden transition-all duration-300",
        !hoverEffect && !levitate && "hover:transform-none",
        levitate && "liquid-card-levitation",
        ionHint && "liquid-card-ion-glow",
        className
      )}
      {...props}
    >
      <div
        className="absolute inset-0 opacity-[0.02] pointer-events-none mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      />

      <div className="relative z-10 h-full">
        {children}
      </div>
    </motion.div>
  );
}

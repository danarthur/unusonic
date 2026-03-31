'use client';

import React from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

interface LiquidPanelProps extends HTMLMotionProps<"div"> {
  children?: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
  /** Static surface — contains interactive children, no hover on the card itself */
  static?: boolean;
  /** Levitation: floats above grid (scale, deeper shadow) — medium urgency */
  levitate?: boolean;
  /** Subsurface Aion glow when Aion has a contextual suggestion (uses `liquid-card-ion-glow` in globals). */
  ionHint?: boolean;
}

export function LiquidPanel({
  children = null,
  className,
  hoverEffect = false,
  static: isStatic = false,
  levitate = false,
  ionHint = false,
  ...props
}: LiquidPanelProps) {
  void hoverEffect;
  void isStatic;
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] } }}
      transition={STAGE_MEDIUM}
      className={cn(
        "stage-panel",
        "relative overflow-hidden",
        levitate && "stage-panel-elevated",
        ionHint && "liquid-card-ion-glow",
        className
      )}
      style={{ padding: 'var(--stage-padding, 16px)' }}
      {...props}
    >
      <div className="relative z-10 h-full">
        {children}
      </div>
    </motion.div>
  );
}

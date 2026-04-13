'use client';

import { MotionConfig } from 'framer-motion';

/**
 * Wraps children in MotionConfig with reducedMotion="user".
 * Respects the OS prefers-reduced-motion setting for all
 * Framer Motion animations within the subtree.
 */
export function ReducedMotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}

'use client';

import { useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

/**
 * KineticNumber – "Data Pulse" typography.
 * When the value changes, the number briefly swells in weight (400 → 800) then
 * settles back. Uses variable font axis 'wght' for elastic, premium feel.
 */
export function KineticNumber({ value, className }: { value: number; className?: string }) {
  const weightSpring = useSpring(400, { stiffness: 300, damping: 20 });
  const fontVariationSettings = useTransform(weightSpring, (latest) => `'wght' ${latest}`);

  useEffect(() => {
    weightSpring.set(800);
    const t = setTimeout(() => weightSpring.set(400), 50);
    return () => clearTimeout(t);
  }, [value, weightSpring]);

  return (
    <motion.span
      style={{ fontVariationSettings }}
      className={className ?? 'text-4xl text-neon-blue font-sans tracking-tight tabular-nums'}
    >
      {value}
    </motion.span>
  );
}

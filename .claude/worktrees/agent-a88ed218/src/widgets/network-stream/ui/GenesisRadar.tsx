'use client';

/**
 * The Radar Sweep – zero-state background. Implies "system is active, scanning for connections."
 * Non-interactive (pointer-events-none), behind content (-z-10).
 */

import { motion } from 'framer-motion';

const size = 420;

export function GenesisRadar() {
  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <div
        className="absolute -z-10 rounded-full border border-white/5"
        style={{
          width: size,
          height: size,
          background: `
            radial-gradient(
              circle at 50% 50%,
              transparent 0%,
              oklch(0.70 0.15 250 / 0.03) 35%,
              oklch(0.70 0.15 250 / 0.06) 50%,
              transparent 70%
            )
          `,
        }}
      />
      {/* Sweep line – spins slowly */}
      <motion.div
        className="absolute -z-10 origin-center"
        style={{
          width: 2,
          height: size / 2,
          background: 'linear-gradient(to bottom, transparent, oklch(0.70 0.15 250 / 0.25) 20%, oklch(0.70 0.15 250 / 0.5) 50%, transparent 80%)',
          borderRadius: 1,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: 'linear',
        }}
      />
    </div>
  );
}

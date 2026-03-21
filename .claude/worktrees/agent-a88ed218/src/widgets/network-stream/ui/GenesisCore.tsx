'use client';

import { motion } from 'framer-motion';
import { LivingLogo } from '@/shared/ui/branding/living-logo';
import type { GenesisReaction } from './GenesisState';

export interface GenesisCoreProps {
  /** Physics reaction from card hover: focus / pulse / mass. Drives logo animation; no broken line. */
  reaction?: GenesisReaction;
}

/**
 * Reactive Organism – Living Logo as Genesis Core.
 * Idle = breathing; card hover = focus / pulse / mass (physics, no loading dash).
 */
export function GenesisCore({ reaction }: GenesisCoreProps) {
  return (
    <div className="relative z-0 transition-all duration-200 backdrop-blur-0">
      <motion.div
        className={`flex items-center justify-center transition-all duration-200 ease-out ${
          reaction ? 'scale-110 opacity-100' : 'opacity-80'
        }`}
        style={{ mixBlendMode: 'screen' }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      >
        <div className="scale-150">
          <LivingLogo status="idle" size="lg" />
        </div>
      </motion.div>
    </div>
  );
}

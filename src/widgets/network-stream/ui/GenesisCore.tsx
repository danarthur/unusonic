'use client';

import { motion } from 'framer-motion';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
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
    <div className="relative z-0 transition-colors duration-[80ms] ">
      <motion.div
        className={`flex items-center justify-center transition-opacity duration-[80ms] ease-out ${
          reaction ? 'opacity-100' : 'opacity-80'
        }`}
        style={{ mixBlendMode: 'screen' }}
        transition={STAGE_LIGHT}
      >
        <div className="scale-150">
          <LivingLogo status="idle" size="lg" />
        </div>
      </motion.div>
    </div>
  );
}

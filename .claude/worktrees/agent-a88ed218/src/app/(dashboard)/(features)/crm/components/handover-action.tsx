'use client';

import { motion } from 'framer-motion';
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';

type HandoverActionProps = {
  onHandover: () => void;
  handingOver?: boolean;
};

/**
 * Build proposal CTA — Liquid Glass button (refractive edge, spring physics).
 * Design: hover scale(1.02) + brightness(1.1), tap scale(0.98).
 */
export function HandoverAction({ onHandover, handingOver }: HandoverActionProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SIGNAL_PHYSICS}
      className="shrink-0 pt-2"
    >
      <motion.button
        type="button"
        onClick={onHandover}
        disabled={handingOver}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={SIGNAL_PHYSICS}
        className="liquid-levitation w-full py-4 px-6 rounded-[28px] border border-white/10 backdrop-blur-xl font-medium text-sm tracking-tight transition-all hover:brightness-110 disabled:opacity-60 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)] bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] hover:bg-[var(--color-neon-amber)]/20"
      >
        {handingOver ? 'Building…' : 'Build proposal'}
      </motion.button>
    </motion.div>
  );
}

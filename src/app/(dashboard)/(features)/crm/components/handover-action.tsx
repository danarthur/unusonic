'use client';

import { motion } from 'framer-motion';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

type HandoverActionProps = {
  onHandover: () => void;
  handingOver?: boolean;
};

/**
 * Build proposal CTA — Stage Engineering button with weight-appropriate spring.
 */
export function HandoverAction({ onHandover, handingOver }: HandoverActionProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="shrink-0 pt-2"
    >
      <motion.button
        type="button"
        onClick={onHandover}
        disabled={handingOver}
        transition={STAGE_MEDIUM}
        className="stage-btn stage-btn-primary w-full py-4 px-6 disabled:opacity-60 disabled:pointer-events-none"
      >
        {handingOver ? 'Building…' : 'Build proposal'}
      </motion.button>
    </motion.div>
  );
}

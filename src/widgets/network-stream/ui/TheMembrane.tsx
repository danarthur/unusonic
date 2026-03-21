'use client';

import { motion } from 'framer-motion';

interface MembraneProps {
  label?: string;
}

/**
 * Visual divider between network zones.
 * Glowing gradient line with centered pill label.
 */
export function TheMembrane({ label = 'Network' }: MembraneProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-3 py-2"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
    >
      <motion.div
        className="h-px w-full max-w-md flex-1 origin-center"
        initial={{ scaleX: 0, opacity: 0.5 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 24, delay: 0.15 }}
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, oklch(0.70 0.15 250 / 0.4) 50%, transparent 100%)',
          boxShadow: '0 0 12px oklch(0.70 0.15 250 / 0.3)',
        }}
      />
      <span className="rounded-full border border-[var(--color-mercury)] bg-[var(--color-glass-surface)] px-4 py-1.5 text-xs font-medium tracking-wide text-[var(--color-ink-muted)] backdrop-blur-sm">
        {label}
      </span>
    </motion.div>
  );
}

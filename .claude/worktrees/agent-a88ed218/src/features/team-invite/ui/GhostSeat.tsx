'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export type GhostSeatStatus = 'empty' | 'filled' | 'sending';

export interface GhostSeatProps {
  email?: string;
  status: GhostSeatStatus;
  className?: string;
}

/**
 * A seat in the cockpit – empty (dashed + plus) or filled (initial + brand tint).
 */
export function GhostSeat({ email, status, className }: GhostSeatProps) {
  const isEmpty = status === 'empty';
  const initial = email?.trim().charAt(0).toUpperCase() ?? '?';

  return (
    <motion.div
      layout
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={cn(
        'size-16 shrink-0 rounded-full flex items-center justify-center border-2 transition-colors duration-300 relative',
        isEmpty
          ? 'border-dashed border-[var(--color-mercury)] text-[var(--color-ink-muted)]/40'
          : 'border-solid border-[var(--color-silk)]/50 bg-[var(--color-silk)]/10 text-[var(--color-silk)]',
        className
      )}
    >
      {isEmpty ? (
        <Plus className="size-5" strokeWidth={1.5} />
      ) : (
        <span className="text-xl font-semibold uppercase tracking-tight">{initial}</span>
      )}
      {status === 'sending' && (
        <span
          className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-[var(--color-silk)] animate-ping opacity-80"
          aria-hidden
        />
      )}
    </motion.div>
  );
}

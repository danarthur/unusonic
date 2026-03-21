'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/ui/popover';
import { M3_DURATION_S, M3_EASING_ENTER } from '@/shared/lib/motion-constants';

type IonLensProps = {
  /** Stub predictive insight (e.g. "ION predicts this invoice will be 4 days late"). */
  insight?: string;
  /** Optional class for the trigger button. */
  className?: string;
};

/**
 * ION Lens — icon that shows a predictive insight for this widget (stub).
 * Place next to widget headers; tapping opens a popover with the insight.
 */
export function IonLens({ insight = 'ION insight will appear here once connected.', className }: IonLensProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded-lg p-1.5 text-muted hover:text-neon transition-colors focus:outline-none focus:ring-2 focus:ring-neon/30 ${className ?? ''}`}
          aria-label="ION predictive insight"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="liquid-card p-4 max-w-[280px] border-[var(--glass-border)]"
        sideOffset={8}
      >
        <AnimatePresence>
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER }}
            className="text-xs text-muted leading-relaxed"
          >
            {insight}
          </motion.p>
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  );
}

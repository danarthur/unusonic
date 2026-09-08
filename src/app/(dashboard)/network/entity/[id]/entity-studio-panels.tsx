'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

export function AccordionSection({
  label,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="stage-panel rounded-2xl overflow-hidden" data-surface="surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[oklch(1_0_0/0.08)] transition-colors duration-[80ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)]"
      >
        <span className="flex items-center gap-2 stage-label">
          <Icon className="size-3.5" strokeWidth={1.5} />
          {label}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={STAGE_MEDIUM}>
          <ChevronDown className="size-4 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[var(--stage-edge-subtle)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

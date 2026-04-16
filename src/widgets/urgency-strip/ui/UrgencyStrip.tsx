'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { UrgencyAlert } from '@/widgets/dashboard/api/get-urgency-alerts';
import {
  STAGE_MEDIUM,
  STAGE_STAGGER_CHILDREN,
} from '@/shared/lib/motion-constants';
import { AlertRow } from './AlertRow';

interface UrgencyStripProps {
  alerts: UrgencyAlert[];
}

/**
 * Optional bento card rendering the full urgency list inline. The lobby
 * header's fire-dot popover is the default surface; this component is here
 * for users who want a persistent triage card on their dashboard.
 */
export function UrgencyStrip({ alerts }: UrgencyStripProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const visible = useMemo(
    () => alerts.filter((a) => !dismissedIds.has(a.id)),
    [alerts, dismissedIds],
  );

  const dismiss = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  if (visible.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={STAGE_MEDIUM}
        role="region"
        aria-label="Needs attention"
      >
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            visible: {
              transition: { staggerChildren: STAGE_STAGGER_CHILDREN },
            },
            hidden: {},
          }}
          className="flex flex-col gap-0.5 px-1 max-h-60 overflow-y-auto"
        >
          {visible.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onDismiss={dismiss} />
          ))}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';
import {
  Users,
  Receipt,
  FileText,
  UserCheck,
  AlertTriangle,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { UrgencyAlert } from '@/widgets/dashboard/api/get-urgency-alerts';
import {
  STAGE_MEDIUM,
  STAGE_LIGHT,
  STAGE_STAGGER_CHILDREN,
} from '@/shared/lib/motion-constants';

const MAX_VISIBLE = 5;

const ICON_MAP: Record<UrgencyAlert['type'], LucideIcon> = {
  crew_gap: Users,
  overdue_invoice: Receipt,
  expiring_proposal: FileText,
  unconfirmed_crew: UserCheck,
};

interface UrgencyStripProps {
  alerts: UrgencyAlert[];
}

export function UrgencyStrip({ alerts: initialAlerts }: UrgencyStripProps) {
  const [alerts, setAlerts] = useState(initialAlerts);

  const dismiss = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (alerts.length === 0) return null;

  const visible = alerts.slice(0, MAX_VISIBLE);
  const overflow = alerts.length - MAX_VISIBLE;

  return (
    <AnimatePresence>
      {visible.length > 0 && (
        <motion.div
          className="stage-panel py-2 px-4 flex flex-col gap-1"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={STAGE_MEDIUM}
          style={{ overflow: 'hidden' }}
          role="region"
          aria-label="Needs attention"
        >
          <div className="flex items-center gap-2 pb-1 border-b border-[var(--stage-edge-subtle)] mb-1">
            <AlertTriangle
              className="w-3.5 h-3.5 text-[var(--color-unusonic-warning,var(--stage-text-secondary))]"
              strokeWidth={1.75}
              aria-hidden
            />
            <h2 className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-widest">
              Needs attention
            </h2>
            <span className="ml-auto text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
              {alerts.length}
            </span>
          </div>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: { staggerChildren: STAGE_STAGGER_CHILDREN },
              },
              hidden: {},
            }}
            className="flex flex-col gap-1"
          >
            {visible.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onDismiss={dismiss} />
            ))}
          </motion.div>

          {overflow > 0 && (
            <p className="stage-label pl-7 pt-1">
              +{overflow} more
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AlertRow({
  alert,
  onDismiss,
}: {
  alert: UrgencyAlert;
  onDismiss: (id: string) => void;
}) {
  const Icon = ICON_MAP[alert.type];
  const isCritical = alert.severity === 'critical';

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 6 },
        visible: { opacity: 1, y: 0 },
      }}
      transition={STAGE_LIGHT}
      className="flex items-center gap-3 py-1 group"
    >
      <Icon
        className="w-4 h-4 shrink-0"
        strokeWidth={1.5}
        style={{
          color: isCritical
            ? 'var(--color-unusonic-error)'
            : 'var(--color-unusonic-warning)',
        }}
        aria-hidden
      />

      <span
        className="stage-readout-sm shrink-0"
        style={{
          color: isCritical
            ? 'var(--color-unusonic-error)'
            : 'var(--color-unusonic-warning)',
        }}
      >
        {alert.title}
      </span>

      <span className="stage-label truncate min-w-0">
        {alert.detail}
      </span>

      <span className="flex-1" />

      <Link
        href={alert.actionUrl}
        className="text-xs font-medium shrink-0 transition-colors text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]"
      >
        View
      </Link>

      <button
        type="button"
        onClick={() => onDismiss(alert.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--stage-text-tertiary)' }}
        aria-label={`Dismiss alert: ${alert.title}`}
      >
        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
      </button>
    </motion.div>
  );
}

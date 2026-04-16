'use client';

/**
 * Single urgency alert row — shared between the optional UrgencyStrip bento
 * widget and the lobby header fire-dot triage popover. Keeps the alert
 * presentation consistent wherever it's surfaced.
 *
 * @module widgets/urgency-strip/ui/AlertRow
 */

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Users,
  Receipt,
  FileText,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { UrgencyAlert } from '@/widgets/dashboard/api/get-urgency-alerts';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

export const ALERT_ICON_MAP: Record<UrgencyAlert['type'], LucideIcon> = {
  crew_gap: Users,
  overdue_invoice: Receipt,
  expiring_proposal: FileText,
  unconfirmed_crew: UserCheck,
};

export interface AlertRowProps {
  alert: UrgencyAlert;
  onDismiss: (id: string) => void;
  onNavigate?: () => void;
}

export function AlertRow({ alert, onDismiss, onNavigate }: AlertRowProps) {
  const Icon = ALERT_ICON_MAP[alert.type];
  const isCritical = alert.severity === 'critical';
  const color = isCritical
    ? 'var(--color-unusonic-error)'
    : 'var(--color-unusonic-warning)';

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
        style={{ color }}
        aria-hidden
      />
      <span className="stage-readout-sm shrink-0" style={{ color }}>
        {alert.title}
      </span>
      <span className="stage-label truncate min-w-0">{alert.detail}</span>
      <span className="flex-1" />
      <Link
        href={alert.actionUrl}
        onClick={onNavigate}
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

'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  FileText,
  ListChecks,
  MessageSquare,
  Receipt,
  Truck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import type { ActionItem } from '@/widgets/dashboard/api';
import {
  STAGE_LIGHT,
  M3_SHARED_AXIS_Y_VARIANTS,
} from '@/shared/lib/motion-constants';

// ── Constants ────────────────────────────────────────────────────────────────

const typeIcons: Record<ActionItem['type'], LucideIcon> = {
  follow_up: MessageSquare,
  unsigned_proposal: FileText,
  overdue_invoice: Receipt,
  pending_crew: Users,
  logistics: Truck,
};

const priorityConfig: Record<
  ActionItem['priority'],
  { label: string; color: string }
> = {
  overdue: { label: 'Overdue', color: 'var(--color-unusonic-error)' },
  today: { label: 'Today', color: 'var(--stage-text-primary)' },
  this_week: { label: 'This week', color: 'var(--stage-text-secondary)' },
};

// ── Action Row ───────────────────────────────────────────────────────────────

function ActionRow({ item }: { item: ActionItem }) {
  const Icon = typeIcons[item.type] ?? ListChecks;

  return (
    <motion.div
      variants={M3_SHARED_AXIS_Y_VARIANTS}
      transition={STAGE_LIGHT}
      className="flex items-center gap-3 py-2"
    >
      <Icon
        className="w-4 h-4 shrink-0"
        style={{ color: 'var(--stage-text-secondary)' }}
        strokeWidth={1.5}
      />
      <div className="flex-1 min-w-0">
        <p className="stage-readout-sm truncate">{item.title}</p>
        <p className="stage-label truncate">{item.detail}</p>
      </div>
      <Link
        href={item.actionUrl}
        className="shrink-0 text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
      >
        {item.actionLabel}
      </Link>
    </motion.div>
  );
}

// ── Section Header ───────────────────────────────────────────────────────────

function SectionHeader({ priority }: { priority: ActionItem['priority'] }) {
  const config = priorityConfig[priority];
  return (
    <p
      className="text-[10px] uppercase tracking-widest font-medium mt-3 mb-1 first:mt-0"
      style={{ color: config.color }}
    >
      {config.label}
    </p>
  );
}

// ── Widget ────────────────────────────────────────────────────────────────────

interface ActionQueueWidgetProps {
  data: ActionItem[];
  loading?: boolean;
}

export function ActionQueueWidget({ data, loading }: ActionQueueWidgetProps) {
  // Pre-compute which items need a section header (priority group boundary)
  const headerIndices = new Set<number>();
  let prevPriority: ActionItem['priority'] | null = null;
  for (let i = 0; i < data.length; i++) {
    if (data[i].priority !== prevPriority) {
      headerIndices.add(i);
      prevPriority = data[i].priority;
    }
  }

  return (
    <WidgetShell
      icon={ListChecks}
      label="Actions"
      loading={loading}
      empty={data.length === 0}
      emptyMessage="All clear — no actions needed"
      emptyIcon={CheckCircle2}
    >
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {data.map((item, i) => (
            <React.Fragment key={item.id}>
              {headerIndices.has(i) && <SectionHeader priority={item.priority} />}
              <ActionRow item={item} />
            </React.Fragment>
          ))}
        </div>
      </div>
    </WidgetShell>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  Activity,
  Handshake,
  Send,
  PenLine,
  UserCheck,
  CreditCard,
  PartyPopper,
} from 'lucide-react';
import type { ActivityItem } from '@/widgets/dashboard/api/get-activity-feed';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { formatRelTime } from '@/shared/lib/format-currency';
import {
  STAGE_MEDIUM,
  STAGE_LIGHT,
} from '@/shared/lib/motion-constants';

// ── Icon map ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<ActivityItem['type'], React.ElementType> = {
  deal_created: Handshake,
  proposal_sent: Send,
  proposal_signed: PenLine,
  crew_confirmed: UserCheck,
  invoice_paid: CreditCard,
  event_completed: PartyPopper,
};

// ── Filter config ───────────────────────────────────────────────────────────

type FilterKey = 'all' | 'deals' | 'proposals' | 'crew' | 'finance';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'deals', label: 'Deals' },
  { key: 'proposals', label: 'Proposals' },
  { key: 'crew', label: 'Crew' },
  { key: 'finance', label: 'Finance' },
];

const FILTER_TYPES: Record<FilterKey, ActivityItem['type'][] | null> = {
  all: null,
  deals: ['deal_created'],
  proposals: ['proposal_sent', 'proposal_signed'],
  crew: ['crew_confirmed'],
  finance: ['invoice_paid', 'event_completed'],
};


// ── Component ───────────────────────────────────────────────────────────────

interface ActivityFeedWidgetProps {
  data: ActivityItem[];
  loading?: boolean;
}

export function ActivityFeedWidget({ data, loading = false }: ActivityFeedWidgetProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const filtered = useMemo(() => {
    const types = FILTER_TYPES[filter];
    if (!types) return data;
    return data.filter((item) => types.includes(item.type));
  }, [data, filter]);

  return (
    <WidgetShell
      icon={Activity}
      label="Recent Activity"
      loading={loading}
      empty={data.length === 0}
      emptyMessage="No recent activity"
      skeletonRows={5}
    >
      <div className="flex flex-col gap-3 h-full">
        {/* Filter pills */}
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          {FILTERS.map(({ key, label }) => (
            <motion.button
              key={key}
              onClick={() => setFilter(key)}
              className="px-2.5 py-1 rounded-full stage-label transition-colors"
              style={{
                background:
                  filter === key
                    ? 'var(--stage-surface-raised)'
                    : 'var(--ctx-well)',
                color:
                  filter === key
                    ? 'var(--stage-text-primary)'
                    : 'var(--stage-text-secondary)',
              }}
              whileTap={{ scale: 0.97 }}
              transition={STAGE_LIGHT}
              layout
              layoutId={`activity-pill-${key}`}
            >
              {label}
            </motion.button>
          ))}
        </div>

        {/* Timeline */}
        <div className="flex-1 min-h-0 overflow-y-auto relative">
          {/* Vertical timeline line */}
          <div
            className="absolute left-[11px] top-2 bottom-2 w-[2px] rounded-full"
            style={{ background: 'var(--stage-text-secondary)', opacity: 0.15 }}
          />

          {filtered.length === 0 ? (
            <p
              className="text-xs py-4 pl-8"
              style={{ color: 'var(--stage-text-secondary)' }}
            >
              No items match this filter.
            </p>
          ) : (
            <div className="flex flex-col">
              {filtered.map((item, i) => {
                const Icon = ICON_MAP[item.type] ?? Activity;
                return (
                  <motion.div
                    key={item.id}
                    variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                    transition={STAGE_MEDIUM}
                  >
                    <Link
                      href={item.linkUrl}
                      className="group flex items-start gap-3 py-2 px-1 rounded-lg transition-colors hover:bg-[var(--ctx-well-hover,oklch(1_0_0/0.04))]"
                    >
                      {/* Icon circle on timeline */}
                      <div
                        className="relative z-10 shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center mt-0.5"
                        style={{
                          background: 'var(--stage-surface-elevated, oklch(0.22 0.004 50))',
                          border: '2px solid var(--stage-edge-subtle, oklch(1 0 0 / 0.08))',
                        }}
                      >
                        <Icon
                          className="w-3 h-3"
                          style={{ color: 'var(--stage-text-secondary)' }}
                          strokeWidth={1.5}
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-xs leading-snug truncate"
                          style={{ color: 'var(--stage-text-primary)' }}
                        >
                          {item.title}
                        </p>
                        <p
                          className="text-label mt-0.5"
                          style={{ color: 'var(--stage-text-secondary)' }}
                        >
                          {formatRelTime(item.timestamp)}
                        </p>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </WidgetShell>
  );
}

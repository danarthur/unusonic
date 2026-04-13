'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Calendar } from 'lucide-react';
import { getEntityCrewSchedule, type CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: CrewScheduleEntry['status'] }) {
  const styles: Record<CrewScheduleEntry['status'], string> = {
    requested: 'bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]',
    confirmed: 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]',
    dispatched: 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]',
  };

  return (
    <span className={`stage-badge-text px-2 py-0.5 rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-2 animate-pulse">
      <div className="space-y-1.5 flex-1 min-w-0">
        <div className="h-3.5 w-32 rounded bg-[var(--stage-surface-elevated)]" />
        <div className="h-3 w-48 rounded bg-[var(--stage-surface-elevated)]" />
      </div>
      <div className="h-5 w-16 rounded-full bg-[var(--stage-surface-elevated)]" />
    </div>
  );
}

const MAX_VISIBLE = 5;

export function UpcomingAssignments({ entityId }: { entityId: string }) {
  const [entries, setEntries] = React.useState<CrewScheduleEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [expanded, setExpanded] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    React.startTransition(() => {
      getEntityCrewSchedule(entityId).then((data) => {
        if (!cancelled) {
          setEntries(data);
          setLoading(false);
        }
      });
    });
    return () => { cancelled = true; };
  }, [entityId]);

  const visible = entries.slice(0, MAX_VISIBLE);
  const hasMore = entries.length > MAX_VISIBLE;
  const count = entries.length;

  return (
    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
      {/* Heading */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <h3 className="stage-label text-[var(--stage-text-secondary)]">
            Upcoming
          </h3>
          {!loading && count > 0 && (
            <span className="stage-badge-text px-1.5 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] tabular-nums">
              {count}
            </span>
          )}
        </div>
        <motion.span
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={STAGE_MEDIUM}
        >
          <ChevronDown className="size-4 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
        </motion.span>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div className="pt-3">
              {loading && (
                <div className="space-y-0">
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </div>
              )}

              {!loading && count === 0 && (
                <div className="flex items-center gap-2 py-3 text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
                  <Calendar className="size-3.5" strokeWidth={1.5} />
                  No upcoming assignments
                </div>
              )}

              {!loading && count > 0 && (
                <div className="divide-y divide-[var(--stage-edge-subtle)]">
                  {visible.map((entry) => (
                    <div key={entry.assignment_id} className="flex items-center justify-between py-2 first:pt-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] truncate">
                          {entry.event_title ?? 'Untitled show'}
                        </p>
                        <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
                          {entry.role}
                          <span className="mx-1.5 text-[var(--stage-text-tertiary)]">·</span>
                          {formatShortDate(entry.starts_at)}
                        </p>
                      </div>
                      <StatusBadge status={entry.status} />
                    </div>
                  ))}
                </div>
              )}

              {hasMore && (
                <p className="pt-2 stage-label text-[var(--stage-text-secondary)] cursor-default">
                  +{entries.length - MAX_VISIBLE} more
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

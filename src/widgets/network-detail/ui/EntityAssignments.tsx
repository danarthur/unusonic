'use client';

/**
 * Crew assignments for one entity, at two depths.
 *
 * This was two components -- UpcomingAssignments in the slide-over panel and
 * AssignmentsPanel on the full page -- calling the same server action and
 * rendering the same rows with different chrome. Worse than the duplicated
 * code: the same assignment looked different depending on where you saw it.
 * `confirmed` was green on the page and grey in the panel, so a state you had
 * just read one way re-rendered another way after a single click.
 *
 * One component, two variants:
 *   summary -- upcoming only, capped, for the panel. A peek answers a question
 *              and offers a way in; it is not the place for a full history.
 *   full    -- upcoming plus past, for the page. Depth is the reason the page
 *              exists next to the panel.
 *
 * Status is achromatic on purpose. requested / confirmed / dispatched are
 * progress states rather than success and failure, and brightness carries
 * progression on its own -- which is also the house rule: only genuinely
 * semantic status takes a hue.
 *
 * @module widgets/network-detail/ui/EntityAssignments
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Calendar } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  getEntityCrewSchedule,
  getEntityCrewHistory,
  type CrewScheduleEntry,
} from '@/features/ops/actions/get-entity-crew-schedule';

export type EntityRecordVariant = 'summary' | 'full';

/** How many upcoming rows the peek shows before it defers to the full page. */
const SUMMARY_MAX = 5;

const EMPTY: CrewScheduleEntry[] = [];

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Brightness encodes progression: a request is dimmest, a dispatched call is
 * brightest. Rendered identically on both surfaces so the same assignment reads
 * the same way wherever it is seen.
 */
const STATUS_STYLE: Record<CrewScheduleEntry['status'], string> = {
  requested: 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)]',
  confirmed: 'bg-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)]',
  dispatched: 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]',
};

function StatusBadge({ status, muted }: { status: CrewScheduleEntry['status']; muted?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 stage-badge-text',
        muted ? 'bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-tertiary)]' : STATUS_STYLE[status],
      )}
    >
      {status}
    </span>
  );
}

function AssignmentRow({ entry, muted }: { entry: CrewScheduleEntry; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-[length:var(--stage-data-size)]',
            muted ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--stage-text-primary)]',
          )}
        >
          {entry.event_title ?? 'Untitled show'}
        </p>
        <p className="truncate text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
          {entry.role}
          <span className="mx-1.5 text-[var(--stage-text-tertiary)]">·</span>
          {formatShortDate(entry.starts_at)}
          {entry.venue_name ? ` · ${entry.venue_name}` : ''}
        </p>
      </div>
      <StatusBadge status={entry.status} muted={muted} />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3.5 w-32 rounded stage-skeleton" />
        <div className="h-3 w-48 rounded stage-skeleton" />
      </div>
      <div className="h-5 w-16 rounded-full stage-skeleton" />
    </div>
  );
}

function useAssignments(entityId: string, variant: EntityRecordVariant) {
  const wantsHistory = variant === 'full';

  const upcoming = useQuery({
    queryKey: ['entity-assignments', entityId],
    queryFn: () => getEntityCrewSchedule(entityId),
    staleTime: 60_000,
  });

  const history = useQuery({
    queryKey: ['entity-assignment-history', entityId],
    queryFn: () => getEntityCrewHistory(entityId),
    staleTime: 60_000,
    enabled: wantsHistory,
  });

  return {
    upcoming: upcoming.data ?? EMPTY,
    history: wantsHistory ? history.data ?? EMPTY : EMPTY,
    isPending: upcoming.isPending || (wantsHistory && history.isPending),
  };
}

export interface EntityAssignmentsProps {
  entityId: string;
  variant?: EntityRecordVariant;
}

/** Chrome differs by variant: the page hosts a panel, the peek hosts a divider. */
function shellClass(variant: EntityRecordVariant): string {
  return variant === 'full'
    ? 'stage-panel rounded-2xl px-5 py-4'
    : 'border-t border-[var(--stage-edge-subtle)] pt-[var(--stage-padding)]';
}

function Header({
  variant,
  count,
  expanded,
  onToggle,
}: {
  variant: EntityRecordVariant;
  count: number | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      aria-expanded={expanded}
    >
      <span className="flex items-center gap-2 stage-label text-[var(--stage-text-secondary)]">
        {variant === 'full' && <Calendar className="size-3.5" strokeWidth={1.5} />}
        {variant === 'full' ? 'Assignments' : 'Upcoming'}
        {count !== null && count > 0 && (
          <span className="rounded-full bg-[oklch(1_0_0_/_0.06)] px-1.5 py-0.5 stage-badge-text tabular-nums">
            {count}
          </span>
        )}
      </span>
      <motion.span animate={{ rotate: expanded ? 0 : -90 }} transition={STAGE_MEDIUM}>
        <ChevronDown className="size-4 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
      </motion.span>
    </button>
  );
}

/** Past assignments, behind a toggle. Only the full variant is given any. */
function History({ entries }: { entries: CrewScheduleEntry[] }) {
  const [open, setOpen] = React.useState(false);
  if (entries.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[var(--stage-edge-subtle)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 stage-label transition-colors duration-[80ms] hover:text-[var(--stage-text-primary)]"
        aria-expanded={open}
      >
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} strokeWidth={1.5} />
        {open ? 'Hide history' : `Show history (${entries.length})`}
      </button>
      {open && (
        <div className="mt-2 divide-y divide-[var(--stage-edge-subtle)]">
          {entries.map((entry) => (
            <AssignmentRow key={entry.assignment_id} entry={entry} muted />
          ))}
        </div>
      )}
    </div>
  );
}

function Body({
  isPending,
  visible,
  notShown,
  history,
}: {
  isPending: boolean;
  visible: CrewScheduleEntry[];
  notShown: number;
  history: CrewScheduleEntry[];
}) {
  if (isPending) {
    return (
      <div className="pt-3">
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  return (
    <div className="pt-3">
      <div className="divide-y divide-[var(--stage-edge-subtle)]">
        {visible.map((entry) => (
          <AssignmentRow key={entry.assignment_id} entry={entry} />
        ))}
      </div>

      {/* A count, not a control — the full list is on the record page. */}
      {notShown > 0 && (
        <p className="pt-2 stage-label text-[var(--stage-text-tertiary)]">+{notShown} not shown</p>
      )}

      <History entries={history} />
    </div>
  );
}

export function EntityAssignments({ entityId, variant = 'summary' }: EntityAssignmentsProps) {
  const [expanded, setExpanded] = React.useState(true);
  const { upcoming, history, isPending } = useAssignments(entityId, variant);

  const visible = variant === 'summary' ? upcoming.slice(0, SUMMARY_MAX) : upcoming;

  // Nothing scheduled means nothing rendered, rather than a card whose only
  // content is the words "No upcoming assignments".
  if (!isPending && upcoming.length === 0 && history.length === 0) return null;

  return (
    <section className={shellClass(variant)} data-surface={variant === 'full' ? 'surface' : 'elevated'}>
      <Header
        variant={variant}
        count={isPending ? null : upcoming.length}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
      />
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
            <Body
              isPending={isPending}
              visible={visible}
              notShown={upcoming.length - visible.length}
              history={history}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

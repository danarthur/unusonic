'use client';

import { motion } from 'framer-motion';
import { CalendarDays, MapPin, Clock } from 'lucide-react';
import type { CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    requested: 'bg-[oklch(0.75_0.15_55)] text-[oklch(0.2_0_0)]',
    confirmed: 'bg-[oklch(0.75_0.15_145)] text-[oklch(0.2_0_0)]',
    dispatched: 'bg-[oklch(0.85_0.02_0)] text-[oklch(0.2_0_0)]',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] ?? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function ScheduleCard({ entry, index }: { entry: CrewScheduleEntry; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: index * 0.03 }}
      className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] truncate">
            {entry.event_title ?? 'Untitled event'}
          </h3>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
            {entry.role}
          </p>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--stage-text-tertiary)]">
        <span className="flex items-center gap-1">
          <CalendarDays className="size-3.5" />
          {formatDate(entry.starts_at)}
        </span>
        {entry.starts_at && (
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatTime(entry.starts_at)}
            {entry.ends_at ? ` - ${formatTime(entry.ends_at)}` : ''}
          </span>
        )}
        {entry.venue_name && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3.5" />
            {entry.venue_name}
          </span>
        )}
      </div>
    </motion.div>
  );
}

interface ScheduleListProps {
  upcoming: CrewScheduleEntry[];
  past: CrewScheduleEntry[];
}

export function ScheduleList({ upcoming, past }: ScheduleListProps) {
  const hasContent = upcoming.length > 0 || past.length > 0;

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <CalendarDays className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No assignments yet. When your team schedules you for a show, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Upcoming
          </h2>
          {upcoming.map((entry, i) => (
            <ScheduleCard key={entry.assignment_id} entry={entry} index={i} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Past
          </h2>
          {past.map((entry, i) => (
            <ScheduleCard key={entry.assignment_id} entry={entry} index={i + upcoming.length} />
          ))}
        </section>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';
import { WidgetShell } from '@/widgets/shared/ui/WidgetShell';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { METRICS } from '@/shared/lib/metrics/registry';
import { getThisWeek, type ThisWeekDay, type ThisWeekEntry } from '../api/get-this-week';

const META = METRICS['lobby.this_week'];

function EntryChip({ entry }: { entry: ThisWeekEntry }) {
  const isConfirmed = entry.kind === 'confirmed';
  return (
    <Link
      href={entry.href}
      title={entry.venueName ? `${entry.title} · ${entry.venueName}` : entry.title}
      className={`block w-full rounded-md px-2 py-1.5 text-xs leading-tight truncate transition-colors ${
        isConfirmed
          ? 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)]'
          : 'border border-dashed border-[oklch(1_0_0_/_0.16)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.24)]'
      }`}
    >
      <span className="truncate">{entry.title}</span>
    </Link>
  );
}

function DayColumn({ day }: { day: ThisWeekDay }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <div
        className={`flex items-baseline gap-1.5 pb-1 border-b ${
          day.isToday
            ? 'border-[var(--stage-text-primary)]'
            : 'border-[oklch(1_0_0_/_0.06)]'
        }`}
      >
        <span
          className={`text-[10px] uppercase tracking-wider ${
            day.isToday ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]'
          }`}
        >
          {day.weekday}
        </span>
        <span
          className={`text-sm tabular-nums ${
            day.isToday ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'
          }`}
        >
          {day.dayOfMonth}
        </span>
      </div>
      <div className="flex flex-col gap-1 min-h-[3rem]">
        {day.entries.length === 0 ? (
          <span className="text-[10px] text-[var(--stage-text-tertiary)] italic">—</span>
        ) : (
          day.entries.map((entry) => <EntryChip key={`${entry.kind}-${entry.id}`} entry={entry} />)
        )}
      </div>
    </div>
  );
}

export function ThisWeekWidget() {
  const [days, setDays] = useState<ThisWeekDay[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getThisWeek()
      .then((rows) => {
        if (active) setDays(rows);
      })
      .catch(() => {
        if (active) setDays([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const data = days ?? [];
  const totalEntries = data.reduce((acc, d) => acc + d.entries.length, 0);

  return (
    <WidgetShell
      icon={CalendarDays}
      label={META?.title ?? 'This week'}
      loading={loading}
      empty={!loading && totalEntries === 0}
      emptyMessage={META?.emptyState?.body ?? 'Nothing on the books this week.'}
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
        transition={STAGE_LIGHT}
        className="grid grid-cols-5 gap-2 h-full"
      >
        {data.map((d) => (
          <DayColumn key={d.date} day={d} />
        ))}
      </motion.div>
    </WidgetShell>
  );
}

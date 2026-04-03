'use client';

import * as React from 'react';
import { getEntityCrewSchedule, type CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';

interface AvailabilityCheckProps {
  entityId: string;
}

function isSameDay(dateStr: string, target: string): boolean {
  return dateStr.slice(0, 10) === target;
}

function overlapsDate(entry: CrewScheduleEntry, date: string): boolean {
  if (!entry.starts_at) return false;

  // If no ends_at, treat it as a single-day event
  if (!entry.ends_at) return isSameDay(entry.starts_at, date);

  const startDay = entry.starts_at.slice(0, 10);
  const endDay = entry.ends_at.slice(0, 10);

  return date >= startDay && date <= endDay;
}

type CheckResult =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'available' }
  | { status: 'booked'; conflict: CrewScheduleEntry };

export function AvailabilityCheck({ entityId }: AvailabilityCheckProps) {
  const [selectedDate, setSelectedDate] = React.useState('');
  const [result, setResult] = React.useState<CheckResult>({ status: 'idle' });
  const scheduleRef = React.useRef<CrewScheduleEntry[] | null>(null);
  const [, startTransition] = React.useTransition();

  const checkDate = React.useCallback(
    (date: string, schedule: CrewScheduleEntry[]) => {
      if (!date) {
        setResult({ status: 'idle' });
        return;
      }
      const conflict = schedule.find((entry) => overlapsDate(entry, date));
      if (conflict) {
        setResult({ status: 'booked', conflict });
      } else {
        setResult({ status: 'available' });
      }
    },
    []
  );

  const handleDateChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const date = e.target.value;
      setSelectedDate(date);

      if (!date) {
        setResult({ status: 'idle' });
        return;
      }

      // If we already have the schedule cached, check locally
      if (scheduleRef.current) {
        checkDate(date, scheduleRef.current);
        return;
      }

      // Fetch schedule then check
      setResult({ status: 'loading' });
      startTransition(() => {
        getEntityCrewSchedule(entityId).then((schedule) => {
          scheduleRef.current = schedule;
          checkDate(date, schedule);
        });
      });
    },
    [entityId, checkDate]
  );

  // Reset cache when entityId changes
  React.useEffect(() => {
    scheduleRef.current = null;
    setSelectedDate('');
    setResult({ status: 'idle' });
  }, [entityId]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={selectedDate}
          onChange={handleDateChange}
          className="stage-input h-8 text-xs flex-1 min-w-0"
          aria-label="Check availability date"
        />
        {result.status === 'loading' && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-tertiary)] animate-pulse">
            Checking…
          </span>
        )}
        {result.status === 'available' && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]">
            Available
          </span>
        )}
        {result.status === 'booked' && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-tertiary)]">
            Booked
          </span>
        )}
      </div>
      {result.status === 'booked' && (
        <p className="text-xs text-[var(--stage-text-secondary)]">
          {result.conflict.event_title ?? 'Untitled event'}
          {result.conflict.role ? ` · ${result.conflict.role}` : ''}
        </p>
      )}
    </div>
  );
}

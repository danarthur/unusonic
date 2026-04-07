'use client';

import * as React from 'react';
import { checkCrewAvailability, type CrewAvailabilityResult } from '@/features/ops/actions/check-crew-availability';

interface AvailabilityCheckProps {
  entityId: string;
}

export function AvailabilityCheck({ entityId }: AvailabilityCheckProps) {
  const [selectedDate, setSelectedDate] = React.useState('');
  const [result, setResult] = React.useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | CrewAvailabilityResult
  >({ status: 'idle' });
  const cacheRef = React.useRef<Map<string, CrewAvailabilityResult>>(new Map());
  const [, startTransition] = React.useTransition();

  const handleDateChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const date = e.target.value;
      setSelectedDate(date);

      if (!date) {
        setResult({ status: 'idle' });
        return;
      }

      // Check cache first
      const cached = cacheRef.current.get(date);
      if (cached) {
        setResult(cached);
        return;
      }

      // Fetch via unified availability action
      setResult({ status: 'loading' });
      startTransition(() => {
        checkCrewAvailability(entityId, date).then((res) => {
          cacheRef.current.set(date, res);
          setResult(res);
        });
      });
    },
    [entityId],
  );

  // Reset cache when entityId changes
  React.useEffect(() => {
    cacheRef.current = new Map();
    setSelectedDate('');
    setResult({ status: 'idle' });
  }, [entityId]);

  const statusLabel =
    result.status === 'available'
      ? 'Available'
      : result.status === 'held'
        ? 'Held'
        : result.status === 'booked'
          ? 'Booked'
          : result.status === 'blackout'
            ? 'Blackout'
            : null;

  const statusStyle =
    result.status === 'available'
      ? 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]'
      : result.status === 'held'
        ? 'bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)]'
        : result.status === 'booked' || result.status === 'blackout'
          ? 'bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-secondary)]'
          : '';

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
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] animate-pulse">
            Checking…
          </span>
        )}
        {statusLabel && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle}`}>
            {statusLabel}
          </span>
        )}
      </div>
      {result.status !== 'idle' && result.status !== 'loading' && result.conflicts && result.conflicts.length > 0 && (
        <div className="space-y-0.5">
          {result.conflicts.map((conflict, i) => (
            <p key={i} className="text-xs text-[var(--stage-text-secondary)]">
              {conflict.label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

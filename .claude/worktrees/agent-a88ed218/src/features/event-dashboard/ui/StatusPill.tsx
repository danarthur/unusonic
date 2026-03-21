'use client';

import React, { useTransition } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import type { EventLifecycleStatus } from '@/entities/event';
import { cn } from '@/shared/lib/utils';

const LIFECYCLE_LABELS: Record<EventLifecycleStatus, string> = {
  lead: 'Lead',
  tentative: 'Tentative',
  confirmed: 'Confirmed',
  production: 'Production',
  live: 'Live',
  post: 'Post',
  archived: 'Archived',
  cancelled: 'Cancelled',
};

/** Brand: Liquid Ceramic — mercury rim, glass/semantic surfaces, silk for active. */
const LIFECYCLE_COLORS: Record<EventLifecycleStatus, string> = {
  lead: 'border border-mercury bg-[var(--color-glass-surface)] text-ceramic',
  tentative: 'border border-mercury bg-[var(--color-surface-warning)] text-[var(--color-signal-warning)]',
  confirmed: 'border border-mercury bg-[var(--color-surface-success)] text-[var(--color-signal-success)]',
  production: 'border border-mercury bg-silk/25 text-neon-blue',
  live: 'border border-mercury bg-[var(--color-surface-success)] text-[var(--color-signal-success)]',
  post: 'border border-mercury bg-ink-muted/20 text-ink-muted',
  archived: 'border border-mercury bg-ink-muted/15 text-ink-muted',
  cancelled: 'border border-mercury bg-[var(--color-surface-error)] text-[var(--color-signal-error)]',
};

interface StatusPillProps {
  value: EventLifecycleStatus | null;
  onSave: (value: EventLifecycleStatus) => Promise<{ ok: boolean; error?: string }>;
  className?: string;
}

export function StatusPill({ value, onSave, className }: StatusPillProps) {
  const [pending, startTransition] = useTransition();

  const handleChange = (v: string) => {
    if (!v) return;
    startTransition(async () => {
      await onSave(v as EventLifecycleStatus);
    });
  };

  const status = value ?? 'lead';
  const label = LIFECYCLE_LABELS[status];
  const colorClass = LIFECYCLE_COLORS[status];

  return (
    <Select value={status} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        className={cn(
          'border-0 shadow-none bg-transparent h-auto py-1 px-2 text-xs font-medium rounded-full w-fit',
          colorClass,
          className
        )}
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(LIFECYCLE_LABELS) as EventLifecycleStatus[]).map((s) => (
          <SelectItem key={s} value={s}>
            {LIFECYCLE_LABELS[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

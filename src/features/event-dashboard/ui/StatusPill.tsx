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

/** Brand: Stage Engineering — matte surfaces, OKLCH tokens, semantic status colors. */
const LIFECYCLE_COLORS: Record<EventLifecycleStatus, string> = {
  lead: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] text-[var(--stage-text-primary)]',
  tentative: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--color-surface-warning)] text-[var(--color-unusonic-warning)]',
  confirmed: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--color-surface-success)] text-[var(--color-unusonic-success)]',
  production: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-accent)]/25 text-[var(--stage-accent)]',
  live: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--color-surface-success)] text-[var(--color-unusonic-success)]',
  post: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-text-secondary)]/20 text-[var(--stage-text-secondary)]',
  archived: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-text-secondary)]/15 text-[var(--stage-text-secondary)]',
  cancelled: 'border border-[oklch(1_0_0_/_0.08)] bg-[var(--color-surface-error)] text-[var(--color-unusonic-error)]',
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

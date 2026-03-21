'use client';

import React from 'react';
import { Calendar, Package, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/shared/lib/utils';

interface DateRangeDisplayProps {
  /** Event window (show dates) */
  startsAt: string;
  endsAt: string;
  /** Load-in / load-out – visually distinct */
  loadIn?: string | null;
  loadOut?: string | null;
  className?: string;
}

function formatRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sameDay = format(s, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd');
  if (sameDay) {
    return `${format(s, 'EEE, MMM d')} · ${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`;
  }
  return `${format(s, 'EEE, MMM d, h:mm a')} – ${format(e, 'EEE, MMM d, h:mm a')}`;
}

export function DateRangeDisplay({
  startsAt,
  endsAt,
  loadIn,
  loadOut,
  className,
}: DateRangeDisplayProps) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-silk/30 text-ink">
          <Calendar className="size-3" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">Event</p>
          <p className="text-sm text-ink">{formatRange(startsAt, endsAt)}</p>
        </div>
      </div>
      {(loadIn != null || loadOut != null) && (
        <div className="flex items-start gap-2 border-l-2 border-amber-500/40 pl-3 ml-1">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-amber-500/20 text-amber-800 dark:text-amber-200">
            <Package className="size-3" />
          </span>
          <div className="min-w-0 flex flex-col gap-1">
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wider">
              Load-in / Load-out
            </p>
            {loadIn != null && (
              <p className="text-sm text-ink">
                In: {format(new Date(loadIn), 'EEE, MMM d, h:mm a')}
              </p>
            )}
            {loadOut != null && (
              <p className="text-sm text-ink flex items-center gap-1">
                {loadIn != null && <ArrowRight className="size-3 text-ink-muted" />}
                Out: {format(new Date(loadOut), 'EEE, MMM d, h:mm a')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

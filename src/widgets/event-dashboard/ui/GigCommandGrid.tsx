'use client';

import React from 'react';
import Link from 'next/link';
import type { GigCommandDTO } from '@/entities/event';
import { StagePanel } from '@/shared/ui/stage-panel';
import { DollarSign, FileText, Calendar, ListChecks } from 'lucide-react';
import { format } from 'date-fns';

interface GigCommandGridProps {
  gig: GigCommandDTO;
}

/**
 * Studio layout for a gig with no linked event.
 * Same bento style; links to Finance, Deal, Run of Show.
 */
export function GigCommandGrid({ gig }: GigCommandGridProps) {
  const displayDate = gig.event_date
    ? format(new Date(gig.event_date), 'EEE, MMM d, yyyy')
    : 'TBD';

  return (
    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-6 auto-rows-[minmax(180px,auto)]">
      {/* Zone Header */}
      <div className="md:col-span-12">
        <StagePanel className="relative min-h-[140px] flex flex-col justify-end p-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--stage-accent)]/20 via-transparent to-transparent" />
          <div className="relative z-10 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-light text-[var(--stage-text-primary)] tracking-tight truncate">
                {gig.title ?? 'Untitled Production'}
              </h1>
              <p className="text-sm text-[var(--stage-text-secondary)] mt-1">
                {gig.status ?? '—'} · {displayDate}
              </p>
            </div>
          </div>
        </StagePanel>
      </div>

      {/* Zone Logistics: Date + Venue */}
      <div className="md:col-span-6">
        <StagePanel className="h-full flex flex-col">
          <h3 className="text-sm font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider mb-3">
            Date
          </h3>
          <p className="text-[var(--stage-text-primary)]">{displayDate}</p>
        </StagePanel>
      </div>
      <div className="md:col-span-6">
        <StagePanel className="h-full flex flex-col">
          <h3 className="text-sm font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider mb-3">
            Venue / Location
          </h3>
          <p className="text-[var(--stage-text-primary)]">{gig.location ?? '—'}</p>
        </StagePanel>
      </div>

      {/* Zone Context: Client */}
      <div className="md:col-span-6">
        <StagePanel className="h-full flex flex-col">
          <h3 className="text-sm font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider mb-3">
            Client
          </h3>
          <p className="text-[var(--stage-text-primary)]">{gig.client_name ?? '—'}</p>
        </StagePanel>
      </div>
      <div className="md:col-span-6">
        <StagePanel className="h-full flex flex-col justify-center">
          <p className="text-sm text-[var(--stage-text-secondary)]">
            No event linked yet. Create or link an event from Run of Show or Calendar.
          </p>
        </StagePanel>
      </div>

      {/* Zone Launchpad */}
      <div className="md:col-span-12">
        <StagePanel interactive className="p-6">
          <h3 className="text-sm font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider mb-3">
            Launchpad
          </h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/events/${gig.id}/finance`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] bg-[var(--stage-accent)]/30 hover:bg-[var(--stage-accent)]/50 transition-colors"
            >
              <DollarSign className="size-4" />
              Finance
            </Link>
            <Link
              href={`/events/${gig.id}/deal`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
            >
              <FileText className="size-4" />
              Deal room
            </Link>
            <Link
              href={`/events/${gig.id}/run-of-show`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
            >
              <ListChecks className="size-4" />
              Run of Show
            </Link>
            <Link
              href="/calendar"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
            >
              <Calendar className="size-4" />
              Calendar
            </Link>
          </div>
        </StagePanel>
      </div>
    </div>
  );
}

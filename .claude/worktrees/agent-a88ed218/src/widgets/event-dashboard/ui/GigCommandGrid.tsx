'use client';

import React from 'react';
import Link from 'next/link';
import type { GigCommandDTO } from '@/entities/event';
import { LiquidPanel } from '@/shared/ui/liquid-panel';
import { DollarSign, FileText, Calendar, ListChecks } from 'lucide-react';
import { format } from 'date-fns';

interface GigCommandGridProps {
  gig: GigCommandDTO;
}

/**
 * Command Center layout for a gig with no linked event.
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
        <LiquidPanel className="relative min-h-[140px] flex flex-col justify-end p-6 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-silk/20 via-transparent to-transparent" />
          <div className="relative z-10 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl md:text-3xl font-light text-ink tracking-tight truncate">
                {gig.title ?? 'Untitled Production'}
              </h1>
              <p className="text-sm text-ink-muted mt-1">
                {gig.status ?? '—'} · {displayDate}
              </p>
            </div>
          </div>
        </LiquidPanel>
      </div>

      {/* Zone Logistics: Date + Venue */}
      <div className="md:col-span-6">
        <LiquidPanel className="h-full flex flex-col">
          <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
            Date
          </h3>
          <p className="text-ink">{displayDate}</p>
        </LiquidPanel>
      </div>
      <div className="md:col-span-6">
        <LiquidPanel className="h-full flex flex-col">
          <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
            Venue / Location
          </h3>
          <p className="text-ink">{gig.location ?? '—'}</p>
        </LiquidPanel>
      </div>

      {/* Zone Context: Client */}
      <div className="md:col-span-6">
        <LiquidPanel className="h-full flex flex-col">
          <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
            Client
          </h3>
          <p className="text-ink">{gig.client_name ?? '—'}</p>
        </LiquidPanel>
      </div>
      <div className="md:col-span-6">
        <LiquidPanel className="h-full flex flex-col justify-center">
          <p className="text-sm text-ink-muted">
            No event linked yet. Create or link an event from Run of Show or Calendar.
          </p>
        </LiquidPanel>
      </div>

      {/* Zone Launchpad */}
      <div className="md:col-span-12">
        <LiquidPanel className="liquid-panel-hover p-6">
          <h3 className="text-sm font-medium text-ink-muted uppercase tracking-wider mb-3">
            Launchpad
          </h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/events/${gig.id}/finance`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink bg-silk/30 hover:bg-silk/50 transition-colors"
            >
              <DollarSign className="size-4" />
              Finance
            </Link>
            <Link
              href={`/events/${gig.id}/deal`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-ceramic/5 transition-colors"
            >
              <FileText className="size-4" />
              Deal room
            </Link>
            <Link
              href={`/crm/${gig.id}`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-ceramic/5 transition-colors"
            >
              <ListChecks className="size-4" />
              Run of Show
            </Link>
            <Link
              href="/calendar"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink hover:bg-ceramic/5 transition-colors"
            >
              <Calendar className="size-4" />
              Calendar
            </Link>
          </div>
        </LiquidPanel>
      </div>
    </div>
  );
}

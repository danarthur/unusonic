'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { List, Calendar, CalendarDays } from 'lucide-react';
import type { CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';
import type { OpenPosition } from '@/features/ops/actions/get-open-positions';
import type { DealHold } from '@/features/ops/actions/get-entity-deal-holds';
import type { ConfirmedDealGig } from '@/features/ops/actions/get-entity-confirmed-deals';
import type { BlackoutRange } from '@/features/ops/actions/save-availability';
import type { PrepReadiness } from './page';
import { ScheduleList } from './schedule-list';
import { WeekView } from './week-view';
import { CalendarView } from '../my-calendar/calendar-view';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

type ViewMode = 'list' | 'week' | 'month';

const VIEW_OPTIONS: { id: ViewMode; label: string; icon: typeof List }[] = [
  { id: 'list', label: 'List', icon: List },
  { id: 'week', label: 'Week', icon: CalendarDays },
  { id: 'month', label: 'Month', icon: Calendar },
];

interface ScheduleShellProps {
  upcoming: CrewScheduleEntry[];
  past: CrewScheduleEntry[];
  openPositions: OpenPosition[];
  dealHolds: DealHold[];
  confirmedDeals: ConfirmedDealGig[];
  personEntityId: string;
  blackouts: BlackoutRange[];
  icalToken: string | null;
  initialView: ViewMode;
  prepReadiness?: Record<string, PrepReadiness>;
}

export function ScheduleShell({
  upcoming,
  past,
  openPositions,
  dealHolds,
  confirmedDeals,
  personEntityId,
  blackouts,
  icalToken,
  initialView,
  prepReadiness,
}: ScheduleShellProps) {
  const [view, setView] = useState<ViewMode>(initialView);
  const router = useRouter();

  const handleViewChange = (v: ViewMode) => {
    setView(v);
    // Update URL without full navigation so back button works
    const url = v === 'list' ? '/schedule' : `/schedule?view=${v}`;
    router.replace(url, { scroll: false });
  };

  // Build gig entries for month view
  const allGigs = useMemo(() => {
    return [...upcoming, ...past].map(g => ({
      date: g.starts_at,
      title: g.event_title ?? 'Show',
      status: g.status,
      assignmentId: g.assignment_id,
    }));
  }, [upcoming, past]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Schedule</h1>
      {/* View Toggle */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[var(--stage-surface)]">
          {VIEW_OPTIONS.map((opt) => {
            const active = view === opt.id;
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => handleViewChange(opt.id)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                  ${active
                    ? 'bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)]'
                    : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.04)]'
                  }
                `}
              >
                <Icon className="size-3.5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* View Content */}
      {view === 'list' && (
        <ScheduleList
          upcoming={upcoming}
          past={past}
          openPositions={openPositions}
          dealHolds={dealHolds}
          confirmedDeals={confirmedDeals}
          personEntityId={personEntityId}
          prepReadiness={prepReadiness}
        />
      )}

      {view === 'week' && (
        <WeekView
          entries={upcoming}
          blackouts={blackouts}
        />
      )}

      {view === 'month' && (
        <CalendarView
          entityId={personEntityId}
          initialBlackouts={blackouts}
          gigs={allGigs}
          icalToken={icalToken}
        />
      )}
    </div>
  );
}

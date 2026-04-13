'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ListMusic } from 'lucide-react';

const SW = 1.5;
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import type { Cue, Section } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';
import { fetchCues, fetchSections } from '@/app/(dashboard)/(features)/crm/actions/ros';

interface RunOfShowIndexCardProps {
  eventId: string;
  /** Event start time — avoids refetch, PlanLens already has this */
  startsAt?: string | null;
  className?: string;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatStartDate(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' });
  const date = d.getDate();
  const month = d.toLocaleDateString('en-US', { month: 'short' });
  const hour = d.getHours();
  const min = d.getMinutes();
  const ampm = hour >= 12 ? 'pm' : 'am';
  const h12 = hour % 12 || 12;
  const time = min > 0 ? `${h12}:${String(min).padStart(2, '0')}${ampm}` : `${h12}${ampm}`;
  return `${day} ${date} ${month}, ${time}`;
}

type Readiness = 'ready' | 'in-progress' | 'empty';

function getReadiness(cues: Cue[]): Readiness {
  if (cues.length === 0) return 'empty';
  const allComplete = cues.every((c) => c.title && c.duration_minutes != null && c.duration_minutes > 0);
  return allComplete ? 'ready' : 'in-progress';
}

const readinessDotColor: Record<Readiness, string> = {
  ready: 'oklch(0.7 0.17 145)',
  'in-progress': 'oklch(0.75 0.15 85)',
  empty: 'oklch(0.45 0 0)',
};

export function RunOfShowIndexCard({ eventId, startsAt, className }: RunOfShowIndexCardProps) {
  const [cues, setCues] = useState<Cue[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([fetchCues(eventId), fetchSections(eventId)])
      .then(([c, s]) => {
        if (!active) return;
        setCues(c);
        setSections(s);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => { active = false; };
  }, [eventId]);

  const totalDuration = useMemo(() => cues.reduce((sum, c) => sum + (c.duration_minutes ?? 0), 0), [cues]);
  const readiness = useMemo(() => getReadiness(cues), [cues]);
  const sectionNames = useMemo(
    () => [...sections].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map((s) => s.title).filter(Boolean).join(', '),
    [sections],
  );

  if (loading) {
    return <StagePanel className={cn('!p-4 stage-skeleton min-h-[80px]', className)} padding="none" />;
  }

  if (cues.length === 0) {
    return (
      <Link
        href={`/crm/${eventId}`}
        className={cn(
          'flex flex-col items-center justify-center min-h-[100px] rounded-[var(--stage-radius-panel)] border-2 border-dashed border-[oklch(1_0_0_/_0.08)] stage-panel-elevated p-6 text-center transition-colors hover:border-[oklch(1_0_0_/_0.15)] hover:bg-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          className,
        )}
      >
        <ListMusic size={20} strokeWidth={SW} className="text-[var(--stage-text-secondary)] mb-2" />
        <p className="text-[var(--stage-text-primary)] font-medium tracking-tight leading-none">Build run of show</p>
        <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed mt-2">Create your show timeline with sections and cues</p>
      </Link>
    );
  }

  return (
    <StagePanel className={cn('flex flex-col gap-2', className)}>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListMusic size={14} strokeWidth={SW} className="text-[var(--stage-text-secondary)]" />
          <span className="stage-label text-[var(--stage-text-secondary)]">Run of show</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: readinessDotColor[readiness] }}
          />
          <span className="stage-badge-text tabular-nums text-[var(--stage-text-secondary)] bg-[oklch(1_0_0_/_0.04)] px-1.5 py-0.5 rounded-full">
            {cues.length} cue{cues.length !== 1 ? 's' : ''} · {formatDuration(totalDuration)}
          </span>
        </div>
      </div>

      {/* Section subtitle */}
      {sectionNames && (
        <p className="text-xs text-[var(--stage-text-secondary)] truncate">{sectionNames}</p>
      )}

      {/* Footer row */}
      <Link
        href={`/crm/${eventId}`}
        className="flex items-center justify-between -mx-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-[oklch(1_0_0_/_0.05)]"
      >
        <span className="stage-readout">
          {startsAt ? formatStartDate(startsAt) : <span className="text-[var(--stage-text-tertiary)]">Date TBD</span>}
        </span>
        <span className="flex items-center gap-1 stage-badge-text text-[var(--stage-text-secondary)]">
          Open
          <ChevronRight size={14} strokeWidth={SW} />
        </span>
      </Link>
    </StagePanel>
  );
}

/** @deprecated Use RunOfShowIndexCard instead */
export const RunOfShowMini = RunOfShowIndexCard;

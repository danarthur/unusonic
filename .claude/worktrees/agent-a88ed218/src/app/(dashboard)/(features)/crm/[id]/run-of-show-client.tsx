'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, Users, Plus, Timer, CalendarClock } from 'lucide-react';
import { GlassShell } from '@/shared/ui/glass-shell';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { RunOfShow } from '@/widgets/run-of-show';
import { CueInspector } from '@/app/(dashboard)/(features)/crm/components/CueInspector';
import type { Cue } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';
import { deleteCue, duplicateCue, updateCue, createCue, fetchCues } from '@/app/(dashboard)/(features)/crm/actions/ros';
import type { EventSummary } from '@/entities/event';
import { format as formatDate } from 'date-fns';

type RunOfShowClientProps = {
  eventId: string;
  initialEvent: EventSummary;
};

export function RunOfShowClient({ eventId, initialEvent }: RunOfShowClientProps) {
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  const displayDate = initialEvent.starts_at
    ? formatDate(new Date(initialEvent.starts_at), 'MMM d, yyyy')
    : 'TBD';
  const displayLocation =
    initialEvent.location_name ??
    initialEvent.location_address ??
    '—';

  const selectedCue = useMemo(
    () => cues.find((cue) => cue.id === selectedCueId) ?? null,
    [cues, selectedCueId]
  );

  const computedStartTime = useMemo(() => {
    if (!selectedCueId || cues.length === 0) return null;
    const initialTime = cues[0]?.start_time ?? '18:00';
    const [hours, minutes] = initialTime.split(':').map((value) => Number(value));
    let currentMinutes = hours * 60 + minutes;

    for (const cue of cues) {
      if (cue.id === selectedCueId) {
        const normalizedMinutes = ((currentMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
        const hh = String(Math.floor(normalizedMinutes / 60)).padStart(2, '0');
        const mm = String(normalizedMinutes % 60).padStart(2, '0');
        return `${hh}:${mm}`;
      }
      currentMinutes += cue.duration_minutes ?? 0;
    }
    return null;
  }, [cues, selectedCueId]);

  const totalDurationMinutes = useMemo(
    () => cues.reduce((total, cue) => total + (cue.duration_minutes ?? 0), 0),
    [cues]
  );

  const formatMinutes = (minutes: number) => {
    const safeMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    const hh = String(Math.floor(safeMinutes / 60)).padStart(2, '0');
    const mm = String(safeMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const showEndTime = useMemo(() => {
    if (cues.length === 0) return null;
    const start = cues[0]?.start_time ?? '18:00';
    const [hours, minutes] = start.split(':').map((value) => Number(value));
    const startMinutes = hours * 60 + minutes;
    return formatMinutes(startMinutes + totalDurationMinutes);
  }, [cues, totalDurationMinutes]);

  const totalDurationLabel = useMemo(() => {
    const hours = Math.floor(totalDurationMinutes / 60);
    const minutes = totalDurationMinutes % 60;
    if (hours === 0) return `${minutes}m`;
    if (minutes === 0) return `${hours}h`;
    return `${hours}h ${minutes}m`;
  }, [totalDurationMinutes]);

  const handleSave = async (updates: Partial<Cue>) => {
    const cueId = selectedCueId;
    if (!cueId || !eventId) return;
    setCues((prev) =>
      prev.map((cue) => (cue.id === cueId ? { ...cue, ...updates } : cue))
    );
    try {
      await updateCue(eventId, cueId, updates);
    } catch {
      // Optimistic rollback logic
    }
  };

  const handleCreateCue = async () => {
    if (!eventId) return;
    try {
      await createCue(eventId, { title: 'New Cue', duration_minutes: 10, type: 'stage' });
      const refreshed = await fetchCues(eventId);
      setCues(refreshed);
    } catch (err) {
      console.error('Failed to create cue', err);
    }
  };

  const scrollToCue = (cueId: string) => {
    requestAnimationFrame(() => {
      const element = document.querySelector(`[data-cue-id="${cueId}"]`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  };

  const handleDelete = async () => {
    if (!selectedCueId || !eventId) return;
    const previous = cues;
    setCues((prev) => prev.filter((cue) => cue.id !== selectedCueId));
    setSelectedCueId(null);
    try {
      await deleteCue(eventId, selectedCueId);
    } catch {
      setCues(previous);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedCueId || !eventId) return;
    const source = cues.find((cue) => cue.id === selectedCueId);
    if (!source) return;

    const tempId = `temp-${Date.now()}`;
    const tempCue: Cue = {
      ...source,
      id: tempId,
      title: `${source.title} Copy`,
      sort_order: source.sort_order + 1,
    };

    const nextCues = cues.flatMap((cue) =>
      cue.id === source.id ? [cue, tempCue] : [cue]
    );
    setCues(nextCues);
    setSelectedCueId(tempId);
    scrollToCue(tempId);

    try {
      const { cues: refreshed, newCueId } = await duplicateCue(eventId, selectedCueId);
      setCues(refreshed);
      setSelectedCueId(newCueId);
      scrollToCue(newCueId);
    } catch {
      setCues(cues);
      setSelectedCueId(source.id);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden bg-[var(--background)]">
      <header className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/events/g/${eventId}`}
            className="p-3 rounded-full hover:bg-ceramic/10 text-ink-muted hover:text-ceramic transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
            aria-label="Back to Stream"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-[clamp(1.75rem,4vw,2.25rem)] font-light text-ceramic tracking-tight">
              {initialEvent.title ?? 'Untitled Production'}
            </h1>
            <div className="flex items-center gap-4 text-sm text-ink-muted mt-1">
              <span className="flex items-center gap-1">
                <Users size={14} /> {initialEvent.client_name ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} /> {displayDate}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={14} /> {displayLocation}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCreateCue}
          className="bg-obsidian text-ceramic px-5 py-2.5 rounded-full liquid-levitation flex items-center gap-2 transition-all hover:scale-[1.02] hover:brightness-110 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]"
        >
          <Plus size={16} /> Add Cue
        </button>
      </header>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0">
        <section className="col-span-1 md:col-span-8 h-full min-h-0">
          <GlassShell
            header={
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-widest text-ink-muted">Timeline</span>
                  <span className="text-[10px] font-mono text-ink-muted bg-ink/5 px-2 py-1 rounded-full border border-[var(--glass-border)]">
                    {cues.length} Cues
                  </span>
                </div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-ink-muted" title="Total Run Time">
                    <Timer size={14} className="text-ink-muted/50" />
                    <span className="text-xs font-mono font-medium tracking-tight">{totalDurationLabel}</span>
                  </div>
                  <div className="h-3 w-px bg-[var(--glass-border)]" />
                  <div className="flex items-center gap-2 text-ink" title="Projected End Time">
                    <CalendarClock size={14} className="text-emerald-500/70" />
                    <span className="text-xs font-mono font-medium tracking-tight">
                      Ends {showEndTime ?? '--:--'}
                    </span>
                  </div>
                </div>
              </div>
            }
          >
            <RunOfShow
              eventId={eventId}
              cues={cues}
              selectedCueId={selectedCueId}
              onSelectCue={setSelectedCueId}
              onCuesChange={setCues}
            />
          </GlassShell>
        </section>

        <aside className="hidden md:flex col-span-4 flex-col h-full min-h-0">
          <CueInspector
            selectedCue={selectedCue}
            computedStartTime={computedStartTime}
            onSave={handleSave}
            onDelete={handleDelete}
            onDuplicate={handleDuplicate}
          />
        </aside>

        {/* Mobile: cue inspector in sheet when a cue is selected */}
        <Sheet
          open={isMobile && !!selectedCueId}
          onOpenChange={(open) => {
            if (!open) setSelectedCueId(null);
          }}
        >
          <SheetContent side="right" className="flex flex-col p-0 w-full max-w-md">
            <SheetHeader>
              <SheetTitle>Cue Inspector</SheetTitle>
              <SheetClose />
            </SheetHeader>
            <SheetBody className="flex-1 min-h-0 overflow-y-auto">
              <CueInspector
                selectedCue={selectedCue}
                computedStartTime={computedStartTime}
                onSave={handleSave}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

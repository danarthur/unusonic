'use client';

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Clock, MapPin, Users, Plus, Timer, CalendarClock, FolderPlus, Pencil, Trash2, Check, X, Radio, BookTemplate } from 'lucide-react';

const SW = 1.5;
import { toast } from 'sonner';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import dynamic from 'next/dynamic';

const RunOfShow = dynamic(
  () => import('@/widgets/run-of-show').then((m) => m.RunOfShow),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center p-4"><div className="h-8 w-8 stage-skeleton rounded-lg" /></div> },
);
import { ViewToggle } from '@/widgets/run-of-show/ui/view-toggle';
import type { RosViewMode } from '@/widgets/run-of-show/ui/view-toggle';
import { LiveMode } from '@/widgets/run-of-show/ui/live-mode';
import {
  startShow, advanceCue, pauseShow, resumeShow, endShow, getShowExecutionState,
  type RosExecutionState,
} from '@/features/run-of-show/api/ros-execution';
import { TemplatePicker } from '@/widgets/run-of-show/ui/template-picker';
import { PrintButton } from '@/widgets/run-of-show/ui/print-button';
import { CueInspector } from '@/app/(dashboard)/(features)/events/components/CueInspector';
import type { Cue, Section } from '@/app/(dashboard)/(features)/events/actions/run-of-show-types';
import {
  deleteCue, duplicateCue, updateCue, createCue, fetchCues,
  createSection, updateSection, deleteSection, fetchSections,
} from '@/app/(dashboard)/(features)/events/actions/ros';
import { getEventCrew } from '@/app/(dashboard)/(features)/events/actions/get-event-crew';
import type { EventSummary } from '@/entities/event';
import type { AssignedCrewEntry } from '@/app/(dashboard)/(features)/events/actions/run-of-show-types';
import { format as formatDate } from 'date-fns';
import { cn } from '@/shared/lib/utils';

type RunOfShowClientProps = {
  eventId: string;
  initialEvent: EventSummary;
};

export function RunOfShowClient({ eventId, initialEvent }: RunOfShowClientProps) {
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [eventCrew, setEventCrew] = useState<AssignedCrewEntry[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [viewMode, setViewMode] = useState<RosViewMode>('list');
  const [liveState, setLiveState] = useState<RosExecutionState | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [confirmingDeleteSectionId, setConfirmingDeleteSectionId] = useState<string | null>(null);
  const isLive = liveState !== null;

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const fn = () => setIsMobile(mq.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);

  // Check if show is already live on mount
  useEffect(() => {
    getShowExecutionState(eventId).then((state) => {
      if (state) setLiveState(state);
    });
  }, [eventId]);

  useEffect(() => {
    let active = true;
    getEventCrew(eventId).then((crew) => {
      if (!active) return;
      setEventCrew(crew);
    });
    return () => { active = false; };
  }, [eventId]);

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

  const fmtMinutes = (minutes: number) => {
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
    return fmtMinutes(startMinutes + totalDurationMinutes);
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
    const snapshot = cues;
    setCues((prev) =>
      prev.map((cue) => (cue.id === cueId ? { ...cue, ...updates } : cue))
    );
    try {
      await updateCue(eventId, cueId, updates);
    } catch {
      setCues(snapshot);
      toast.error('Failed to save cue');
    }
  };

  const handleCreateCue = async (sectionId?: string | null) => {
    if (!eventId) return;
    try {
      await createCue(eventId, {
        title: 'New cue',
        duration_minutes: 10,
        type: 'stage',
        section_id: sectionId ?? null,
      });
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

  // Section management
  const handleCreateSection = async () => {
    if (!eventId) return;
    try {
      const newSection = await createSection(eventId, { title: 'New section' });
      setSections((prev) => [...prev, newSection]);
      setEditingSectionId(newSection.id);
      setEditingSectionTitle(newSection.title);
    } catch {
      toast.error('Failed to create section');
    }
  };

  const handleSaveSection = async (sectionId: string) => {
    if (!eventId || !editingSectionTitle.trim()) return;
    try {
      const updated = await updateSection(eventId, sectionId, { title: editingSectionTitle.trim() });
      setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
    } catch {
      toast.error('Failed to update section');
    }
    setEditingSectionId(null);
  };

  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (!eventId) return;
    const prevSections = sections;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    // Move cues from deleted section to unsectioned
    setCues((prev) => prev.map((c) => (c.section_id === sectionId ? { ...c, section_id: null } : c)));
    setConfirmingDeleteSectionId(null);
    try {
      await deleteSection(eventId, sectionId);
      const refreshedCues = await fetchCues(eventId);
      setCues(refreshedCues);
    } catch {
      setSections(prevSections);
      toast.error('Failed to delete section');
    }
  }, [eventId, sections]);

  // Live mode handlers
  const handleGoLive = async () => {
    if (cues.length === 0) { toast.error('Add cues before going live'); return; }
    try {
      const state = await startShow(eventId, cues[0].id);
      setLiveState(state);
      setViewMode('timeline');
    } catch {
      toast.error('Failed to start show');
    }
  };

  const handleAdvanceCue = async (nextCueId: string) => {
    try {
      const state = await advanceCue(eventId, nextCueId);
      setLiveState(state);
    } catch {
      toast.error('Failed to advance cue');
    }
  };

  const handlePauseShow = async () => {
    try {
      const state = await pauseShow(eventId);
      setLiveState(state);
    } catch {
      toast.error('Failed to pause show');
    }
  };

  const handleResumeShow = async () => {
    try {
      const state = await resumeShow(eventId);
      setLiveState(state);
    } catch {
      toast.error('Failed to resume show');
    }
  };

  const handleEndShow = async () => {
    try {
      await endShow(eventId);
      setLiveState(null);
      toast.success('Show ended');
    } catch {
      toast.error('Failed to end show');
    }
  };

  return (
    <div className="h-full flex flex-col p-6 overflow-hidden bg-[var(--stage-void)]">
      <header className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/events/g/${eventId}`}
            className="p-3 rounded-full hover:bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-surface)]"
            aria-label="Back to Stream"
          >
            <ArrowLeft size={20} strokeWidth={SW} />
          </Link>
          <div>
            <h1 className="stage-readout-lg text-[var(--stage-text-primary)] tracking-tight">
              {initialEvent.title ?? 'Untitled production'}
            </h1>
            <div className="flex items-center gap-4 text-sm text-[var(--stage-text-secondary)] mt-1">
              <span className="flex items-center gap-1">
                <Users size={14} strokeWidth={SW} /> {initialEvent.client_name ?? '—'}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} strokeWidth={SW} /> {displayDate}
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={14} strokeWidth={SW} /> {displayLocation}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isLive && (
            <>
              <PrintButton
                eventId={eventId}
                className="p-2.5 rounded-full text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.08)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              />
              <button
                type="button"
                onClick={() => setTemplatePickerOpen(true)}
                className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] px-4 py-2.5 rounded-full flex items-center gap-2 transition-colors hover:bg-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] text-sm"
              >
                <BookTemplate size={16} strokeWidth={SW} /> Templates
              </button>
              <button
                type="button"
                onClick={handleCreateSection}
                className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] px-4 py-2.5 rounded-full flex items-center gap-2 transition-colors hover:bg-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] text-sm"
              >
                <FolderPlus size={16} strokeWidth={SW} /> Add section
              </button>
              <button
                type="button"
                onClick={() => handleCreateCue()}
                className="bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)] px-5 py-2.5 rounded-full flex items-center gap-2 transition-colors duration-[80ms] hover:bg-[oklch(1_0_0_/_0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]"
              >
                <Plus size={16} strokeWidth={SW} /> Add cue
              </button>
            </>
          )}
          <button
            type="button"
            onClick={isLive ? handleEndShow : handleGoLive}
            className={cn(
              'px-5 py-2.5 rounded-full flex items-center gap-2 transition-colors text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              isLive
                ? 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/25'
                : 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)] hover:bg-[var(--color-unusonic-success)]/25'
            )}
          >
            <Radio size={16} strokeWidth={SW} />
            {isLive ? 'End show' : 'Go live'}
          </button>
        </div>
      </header>

      {/* Section management strip */}
      {sections.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4 shrink-0">
          {sections.map((section) => (
            <div
              key={section.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.03)] text-xs"
            >
              <div
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: section.color ?? 'var(--stage-text-secondary)' }}
              />
              {editingSectionId === section.id ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSaveSection(section.id); }}
                  className="flex items-center gap-1"
                >
                  <input
                    autoFocus
                    value={editingSectionTitle}
                    onChange={(e) => setEditingSectionTitle(e.target.value)}
                    onBlur={() => handleSaveSection(section.id)}
                    className="bg-transparent border-none outline-none text-xs text-[var(--stage-text-primary)] w-[100px]"
                  />
                  <button type="submit" className="text-[var(--color-unusonic-success)] p-0.5" aria-label="Save section"><Check size={12} strokeWidth={SW} /></button>
                  <button type="button" onClick={() => setEditingSectionId(null)} className="text-[var(--stage-text-secondary)] p-0.5" aria-label="Cancel editing"><X size={12} strokeWidth={SW} /></button>
                </form>
              ) : (
                <>
                  <span className="text-[var(--stage-text-primary)] font-medium">{section.title}</span>
                  <button
                    type="button"
                    onClick={() => { setEditingSectionId(section.id); setEditingSectionTitle(section.title); }}
                    className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Edit section title"
                  >
                    <Pencil size={10} strokeWidth={SW} />
                  </button>
                  {confirmingDeleteSectionId === section.id ? (
                    <div className="flex items-center gap-2">
                      <span className="stage-label">Cues will move to Unsectioned</span>
                      <button className="stage-btn stage-btn-danger text-sm px-2 py-1" onClick={() => handleDeleteSection(section.id)}>Delete section</button>
                      <button className="stage-btn stage-btn-secondary text-sm px-2 py-1" onClick={() => setConfirmingDeleteSectionId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteSectionId(section.id)}
                      className="text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] p-0.5"
                      aria-label="Delete section"
                    >
                      <Trash2 size={10} strokeWidth={SW} />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-6 min-h-0 overflow-hidden">
        <section className="col-span-1 md:col-span-8 h-full min-h-0">
          <StagePanel className="h-full flex flex-col !overflow-visible">
            <div className="px-2 pb-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="stage-label">Timeline</span>
                <span className="stage-readout-sm text-[var(--stage-text-secondary)] bg-[oklch(1_0_0_/_0.05)] px-2 py-1 rounded-full border border-[oklch(1_0_0_/_0.08)]">
                  {cues.length} cues
                </span>
                {sections.length > 0 && (
                  <span className="stage-readout-sm text-[var(--stage-text-secondary)] bg-[oklch(1_0_0_/_0.05)] px-2 py-1 rounded-full border border-[oklch(1_0_0_/_0.08)]">
                    {sections.length} sections
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4">
                <ViewToggle mode={viewMode} onChange={setViewMode} />
                <div className="h-3 w-px bg-[oklch(1_0_0_/_0.08)]" />
                <div className="flex items-center gap-2 text-[var(--stage-text-secondary)]" title="Total run time">
                  <Timer size={14} strokeWidth={SW} className="text-[var(--stage-text-secondary)]/50" />
                  <span className="stage-readout-sm tracking-tight tabular-nums">{totalDurationLabel}</span>
                </div>
                <div className="h-3 w-px bg-[oklch(1_0_0_/_0.08)]" />
                <div className="flex items-center gap-2 text-[var(--stage-text-primary)]" title="Projected end time">
                  <CalendarClock size={14} strokeWidth={SW} className="text-[var(--stage-text-secondary)]" />
                  <span className="stage-readout-sm tracking-tight tabular-nums">
                    Ends {showEndTime ?? '--:--'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <RunOfShow
                eventId={eventId}
                cues={cues}
                sections={sections}
                selectedCueId={isLive ? liveState?.current_cue_id ?? null : selectedCueId}
                onSelectCue={isLive ? undefined : setSelectedCueId}
                onCuesChange={setCues}
                onSectionsChange={setSections}
                viewMode={viewMode}
                readOnly={isLive}
              />
            </div>
          </StagePanel>
        </section>

        <aside className="hidden md:flex col-span-4 flex-col h-full min-h-0 overflow-y-auto">
          {isLive && liveState ? (
            <LiveMode
              cues={cues}
              executionState={liveState}
              onAdvance={handleAdvanceCue}
              onPause={handlePauseShow}
              onResume={handleResumeShow}
              onEndShow={handleEndShow}
            />
          ) : (
            <CueInspector
              selectedCue={selectedCue}
              computedStartTime={computedStartTime}
              onSave={handleSave}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              eventCrew={eventCrew}
              sections={sections}
            />
          )}
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
              <SheetTitle>Cue inspector</SheetTitle>
              <SheetClose />
            </SheetHeader>
            <SheetBody className="flex-1 min-h-0 overflow-y-auto">
              <CueInspector
                selectedCue={selectedCue}
                computedStartTime={computedStartTime}
                onSave={handleSave}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                eventCrew={eventCrew}
                sections={sections}
              />
            </SheetBody>
          </SheetContent>
        </Sheet>

        <TemplatePicker
          open={templatePickerOpen}
          onOpenChange={setTemplatePickerOpen}
          eventId={eventId}
          currentCues={cues}
          currentSections={sections}
          onApplied={(newCues, newSections) => {
            setCues(newCues);
            setSections(newSections);
          }}
        />
      </div>
    </div>
  );
}

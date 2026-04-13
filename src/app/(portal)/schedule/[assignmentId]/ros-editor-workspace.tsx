'use client';

import { useState, useMemo, useEffect } from 'react';
import { Plus, FolderPlus, Pencil, Trash2, Check, X, Clock, Radio } from 'lucide-react';

const SW = 1.5;
import { toast } from 'sonner';
import { StagePanel } from '@/shared/ui/stage-panel';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { cn } from '@/shared/lib/utils';
import dynamic from 'next/dynamic';

const RunOfShow = dynamic(
  () => import('@/widgets/run-of-show').then((m) => m.RunOfShow),
  { ssr: false, loading: () => <div className="flex items-center justify-center p-8"><div className="h-8 w-8 stage-skeleton rounded-lg" /></div> },
);

import type { Cue, Section, AssignedCrewEntry } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';
import {
  createCue, updateCue, deleteCue, duplicateCue, fetchCues,
  createSection, updateSection, deleteSection, fetchSections,
} from '@/features/run-of-show/api/ros';
import {
  startShow, advanceCue, pauseShow, resumeShow, endShow, getShowExecutionState,
  type RosExecutionState,
} from '@/features/run-of-show/api/ros-execution';
import { LiveMode } from '@/widgets/run-of-show/ui/live-mode';
import { CueInspector } from '@/app/(dashboard)/(features)/crm/components/CueInspector';

interface RosEditorWorkspaceProps {
  eventId: string;
  initialCues: Cue[];
  initialSections: Section[];
  eventCrew: AssignedCrewEntry[];
  canEdit: boolean;
}

export function RosEditorWorkspace({
  eventId,
  initialCues,
  initialSections,
  eventCrew,
  canEdit,
}: RosEditorWorkspaceProps) {
  const [cues, setCues] = useState<Cue[]>(initialCues);
  const [sections, setSections] = useState<Section[]>(initialSections);
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [liveState, setLiveState] = useState<RosExecutionState | null>(null);
  const isLive = liveState !== null;

  // Check if show is already live on mount
  useEffect(() => {
    getShowExecutionState(eventId).then((state) => {
      if (state) setLiveState(state);
    });
  }, [eventId]);

  const selectedCue = useMemo(
    () => cues.find((c) => c.id === selectedCueId) ?? null,
    [cues, selectedCueId]
  );

  const computedStartTime = useMemo(() => {
    if (!selectedCueId || cues.length === 0) return null;
    const initialTime = cues[0]?.start_time ?? '18:00';
    const [hours, minutes] = initialTime.split(':').map((v) => Number(v));
    let current = hours * 60 + minutes;
    for (const cue of cues) {
      if (cue.id === selectedCueId) {
        const norm = ((current % (24 * 60)) + 24 * 60) % (24 * 60);
        return `${String(Math.floor(norm / 60)).padStart(2, '0')}:${String(norm % 60).padStart(2, '0')}`;
      }
      current += cue.duration_minutes ?? 0;
    }
    return null;
  }, [cues, selectedCueId]);

  const totalDuration = useMemo(
    () => cues.reduce((sum, c) => sum + (c.duration_minutes ?? 0), 0),
    [cues]
  );

  const totalLabel = useMemo(() => {
    const h = Math.floor(totalDuration / 60);
    const m = totalDuration % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }, [totalDuration]);

  // Cue handlers
  const handleSave = async (updates: Partial<Cue>) => {
    if (!selectedCueId) return;
    const snapshot = cues;
    setCues((prev) => prev.map((c) => (c.id === selectedCueId ? { ...c, ...updates } : c)));
    try {
      await updateCue(eventId, selectedCueId, updates);
    } catch {
      setCues(snapshot);
      toast.error('Failed to save cue', { duration: Infinity });
    }
  };

  const handleCreateCue = async () => {
    try {
      await createCue(eventId, { title: 'New Cue', duration_minutes: 10, type: 'stage' });
      const refreshed = await fetchCues(eventId);
      setCues(refreshed);
    } catch {
      toast.error('Failed to create cue', { duration: Infinity });
    }
  };

  const handleDelete = async () => {
    if (!selectedCueId) return;
    const prev = cues;
    setCues((c) => c.filter((x) => x.id !== selectedCueId));
    setSelectedCueId(null);
    try {
      await deleteCue(eventId, selectedCueId);
    } catch {
      setCues(prev);
    }
  };

  const handleDuplicate = async () => {
    if (!selectedCueId) return;
    try {
      const { cues: refreshed, newCueId } = await duplicateCue(eventId, selectedCueId);
      setCues(refreshed);
      setSelectedCueId(newCueId);
    } catch {
      toast.error('Failed to duplicate cue', { duration: Infinity });
    }
  };

  // Section handlers
  const handleCreateSection = async () => {
    try {
      const newSection = await createSection(eventId, { title: 'New Section' });
      setSections((prev) => [...prev, newSection]);
      setEditingSectionId(newSection.id);
      setEditingSectionTitle(newSection.title);
    } catch {
      toast.error('Failed to create section', { duration: Infinity });
    }
  };

  const handleSaveSection = async (sectionId: string) => {
    if (!editingSectionTitle.trim()) return;
    try {
      const updated = await updateSection(eventId, sectionId, { title: editingSectionTitle.trim() });
      setSections((prev) => prev.map((s) => (s.id === sectionId ? updated : s)));
    } catch {
      toast.error('Failed to update section', { duration: Infinity });
    }
    setEditingSectionId(null);
  };

  const handleDeleteSection = async (sectionId: string) => {
    if (!window.confirm('Delete this section? Cues will be moved to Unsectioned.')) return;
    const prevSections = sections;
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
    setCues((prev) => prev.map((c) => (c.section_id === sectionId ? { ...c, section_id: null } : c)));
    try {
      await deleteSection(eventId, sectionId);
      const refreshedCues = await fetchCues(eventId);
      setCues(refreshedCues);
    } catch {
      setSections(prevSections);
      toast.error('Failed to delete section', { duration: Infinity });
    }
  };

  // Live mode handlers
  const handleGoLive = async () => {
    if (cues.length === 0) { toast.error('Add cues before going live', { duration: Infinity }); return; }
    try {
      const state = await startShow(eventId, cues[0].id);
      setLiveState(state);
    } catch { toast.error('Failed to start show', { duration: Infinity }); }
  };
  const handleAdvanceCue = async (nextCueId: string) => {
    try { setLiveState(await advanceCue(eventId, nextCueId)); }
    catch { toast.error('Failed to advance cue', { duration: Infinity }); }
  };
  const handlePauseShow = async () => {
    try { setLiveState(await pauseShow(eventId)); }
    catch { toast.error('Failed to pause', { duration: Infinity }); }
  };
  const handleResumeShow = async () => {
    try { setLiveState(await resumeShow(eventId)); }
    catch { toast.error('Failed to resume', { duration: Infinity }); }
  };
  const handleEndShow = async () => {
    try { await endShow(eventId); setLiveState(null); toast.success('Show ended'); }
    catch { toast.error('Failed to end show', { duration: Infinity }); }
  };

  return (
    <div className="mt-6 mx-auto w-full max-w-2xl px-4">
      <StagePanel className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-[var(--stage-text-primary)]">Run of show</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-label font-mono text-[var(--stage-text-secondary)]">
                {cues.length} cue{cues.length !== 1 ? 's' : ''}
              </span>
              <span className="text-label font-mono text-[var(--stage-text-secondary)] flex items-center gap-1">
                <Clock size={10} strokeWidth={SW} /> {totalLabel}
              </span>
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {!isLive && (
                <>
                  <button
                    type="button"
                    onClick={handleCreateSection}
                    className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] px-3 py-2 rounded-full text-xs flex items-center gap-1.5 transition-colors hover:bg-[oklch(1_0_0_/_0.05)]"
                  >
                    <FolderPlus size={14} strokeWidth={SW} /> Section
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateCue}
                    className="bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)] px-4 py-2 rounded-full text-xs flex items-center gap-1.5 transition-colors duration-[80ms] hover:bg-[oklch(1_0_0_/_0.08)]"
                  >
                    <Plus size={14} strokeWidth={SW} /> Cue
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={isLive ? handleEndShow : handleGoLive}
                className={cn(
                  'px-3 py-2 rounded-full text-xs flex items-center gap-1.5 font-medium transition-colors',
                  isLive
                    ? 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)]'
                    : 'bg-[var(--color-unusonic-success)]/15 text-[var(--stage-accent)]'
                )}
              >
                <Radio size={12} strokeWidth={SW} />
                {isLive ? 'End' : 'Go live'}
              </button>
            </div>
          )}
        </div>

        {/* Section management strip */}
        {canEdit && sections.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sections.map((section) => (
              <div
                key={section.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[oklch(1_0_0_/_0.08)] bg-[oklch(1_0_0_/_0.03)] text-label"
              >
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: section.color ?? 'oklch(0.75 0.00 0)' }}
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
                      aria-label="Section name"
                    className="bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.06)] rounded outline-none text-label text-[var(--stage-text-primary)] w-[80px] px-1"
                    />
                    <button type="submit" className="text-[var(--stage-accent)] p-0.5"><Check size={10} strokeWidth={SW} /></button>
                    <button type="button" onClick={() => setEditingSectionId(null)} className="text-[var(--stage-text-secondary)] p-0.5"><X size={10} strokeWidth={SW} /></button>
                  </form>
                ) : (
                  <>
                    <span className="text-[var(--stage-text-primary)] font-medium">{section.title}</span>
                    <button
                      type="button"
                      onClick={() => { setEditingSectionId(section.id); setEditingSectionTitle(section.title); }}
                      className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] p-0.5"
                    >
                      <Pencil size={8} strokeWidth={SW} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSection(section.id)}
                      className="text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] p-0.5"
                    >
                      <Trash2 size={8} strokeWidth={SW} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Live mode or timeline */}
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
          <RunOfShow
            eventId={eventId}
            cues={cues}
            sections={sections}
            selectedCueId={selectedCueId}
            onSelectCue={canEdit ? setSelectedCueId : undefined}
            onCuesChange={setCues}
            onSectionsChange={setSections}
            readOnly={!canEdit}
          />
        )}
      </StagePanel>

      {/* Mobile sheet inspector */}
      {canEdit && (
        <Sheet
          open={!!selectedCueId}
          onOpenChange={(open) => { if (!open) setSelectedCueId(null); }}
        >
          <SheetContent side="right" className="flex flex-col p-0 w-full max-w-md">
            <SheetHeader>
              <SheetTitle>Cue inspector</SheetTitle>
              <SheetClose />
            </SheetHeader>
            <SheetBody className="flex-1 min-h-0 overflow-y-auto pb-safe">
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
      )}
    </div>
  );
}

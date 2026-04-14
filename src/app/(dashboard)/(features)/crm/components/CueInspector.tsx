'use client';

import { useEffect, useMemo, useRef, useState, useOptimistic, startTransition } from 'react';
import { Clock, Mic, Sun, Video, Truck, Copy, Trash2, MousePointerClick } from 'lucide-react';

const SW = 1.5;
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';
import type { Cue, CueType, AssignedCrewEntry, Section } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';

type CueInspectorProps = {
  selectedCue: Cue | null;
  computedStartTime?: string | null;
  onSave: (updates: Partial<Cue>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  eventCrew?: AssignedCrewEntry[];
  sections?: Section[];
};

const typeOptions: { value: CueType; label: string; icon: typeof Mic }[] = [
  { value: 'stage', label: 'Stage', icon: Mic },
  { value: 'audio', label: 'Audio', icon: Video },
  { value: 'lighting', label: 'Lighting', icon: Sun },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'logistics', label: 'Logistics', icon: Truck },
];

export function CueInspector({
  selectedCue,
  computedStartTime,
  onSave,
  onDelete,
  onDuplicate,
  eventCrew,
  sections,
}: CueInspectorProps) {
  // Seed both states from selectedCue so the first render after opening the
  // inspector shows real values instead of an empty struct that flickers to the
  // populated state once the useEffect below runs.
  const initialFormState: Partial<Cue> = selectedCue
    ? {
        title: selectedCue.title,
        duration_minutes: selectedCue.duration_minutes,
        type: selectedCue.type,
        notes: selectedCue.notes ?? '',
        assigned_crew: selectedCue.assigned_crew ?? [],
        section_id: selectedCue.section_id ?? null,
      }
    : {};
  const [formState, setFormState] = useState<Partial<Cue>>(initialFormState);
  const [optimisticCue, setOptimisticCue] = useOptimistic<Partial<Cue>>(initialFormState);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!selectedCue) {
      setFormState({});
      startTransition(() => {
        setOptimisticCue({});
      });
      return;
    }
    setFormState({
      title: selectedCue.title,
      duration_minutes: selectedCue.duration_minutes,
      type: selectedCue.type,
      notes: selectedCue.notes ?? '',
      assigned_crew: selectedCue.assigned_crew ?? [],
      section_id: selectedCue.section_id ?? null,
    });
    startTransition(() => {
      setOptimisticCue({
        title: selectedCue.title,
        duration_minutes: selectedCue.duration_minutes,
        type: selectedCue.type,
        notes: selectedCue.notes ?? '',
        assigned_crew: selectedCue.assigned_crew ?? [],
        section_id: selectedCue.section_id ?? null,
      });
    });
  }, [selectedCue, setOptimisticCue]);

  const activeType = useMemo(() => {
    const match = typeOptions.find((option) => option.value === (optimisticCue.type ?? selectedCue?.type));
    return match ?? typeOptions[0];
  }, [optimisticCue.type, selectedCue?.type]);

  const handleDelete = async () => {
    if (!selectedCue) return;
    await onDelete();
    setConfirmingDelete(false);
  };

  const scheduleSave = (updates: Partial<Cue>) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onSave(updates).catch(() => toast.error('Failed to save cue'));
    }, 500);
  };

  const updateField = <K extends keyof Cue>(key: K, value: Cue[K]) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
    startTransition(() => {
      setOptimisticCue((prev) => ({ ...prev, [key]: value }));
    });
    scheduleSave({ [key]: value } as Partial<Cue>);
  };

  const handleCrewToggle = (entry: AssignedCrewEntry) => {
    const current = (formState.assigned_crew as AssignedCrewEntry[]) ?? [];
    const exists = current.some((c) => c.entity_id === entry.entity_id);
    const updated = exists
      ? current.filter((c) => c.entity_id !== entry.entity_id)
      : [...current, entry];
    updateField('assigned_crew', updated);
  };

  if (!selectedCue) {
    return (
      <StagePanel className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <MousePointerClick size={24} strokeWidth={SW} className="text-[var(--stage-text-secondary)]/70" />
          <p className="text-sm text-[var(--stage-text-secondary)]">Select a cue to edit</p>
        </div>
      </StagePanel>
    );
  }

  return (
    <StagePanel className="flex flex-col gap-6 !overflow-visible">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="stage-label">Cue inspector</h3>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">Adjust timing, type, and notes.</p>
        </div>
        <div className="text-right">
          <p className="stage-label">Starts at</p>
          <div className="stage-readout-hero">
            {computedStartTime ?? '--:--'}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="stage-label">Title</label>
          <input
            value={(formState.title as string) ?? ''}
            onChange={(event) => updateField('title', event.target.value)}
            className="w-full bg-[var(--ctx-well)] rounded-md px-4 py-3 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors border border-[oklch(1_0_0_/_0.08)]"
            placeholder="Cue title"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="stage-label">Duration</label>
            <div className="w-full bg-[var(--ctx-well)] rounded-md px-4 py-3 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus-within:ring-2 focus-within:ring-[var(--stage-accent)] transition-colors border border-[oklch(1_0_0_/_0.08)] flex items-center gap-2">
              <Clock size={14} strokeWidth={SW} className="text-[var(--stage-text-secondary)]" />
              <input
                type="number"
                min={1}
                value={Number(formState.duration_minutes ?? 0)}
                onChange={(event) => updateField('duration_minutes', Number(event.target.value))}
                className="w-full bg-transparent border-none outline-none text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:ring-0"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="stage-label">Type</label>
            <div className="stage-panel stage-panel-nested !p-1 flex items-center gap-2">
              {typeOptions.map((option) => {
                const Icon = option.icon;
                const isActive = (formState.type ?? selectedCue?.type) === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => updateField('type', option.value)}
                    className={cn(
                      'h-9 w-9 rounded-lg flex items-center justify-center transition-colors',
                      isActive
                        ? 'bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)]'
                        : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]'
                    )}
                    aria-label={option.label}
                  >
                    <Icon size={16} strokeWidth={SW} />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 stage-label">
              <activeType.icon size={12} strokeWidth={SW} />
              {activeType.label}
            </div>
          </div>
        </div>

        {/* Section selector */}
        {sections && sections.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="stage-label">Section</label>
            <select
              value={(formState.section_id as string) ?? ''}
              onChange={(event) => updateField('section_id', event.target.value || null)}
              className="w-full bg-[var(--ctx-well)] rounded-md px-4 py-3 text-sm text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors border border-[oklch(1_0_0_/_0.08)] appearance-none"
            >
              <option value="">Unsectioned</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.title}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="stage-label">Crew</label>
          {!eventCrew || eventCrew.length === 0 ? (
            <p className="text-xs text-[var(--stage-text-secondary)]">No crew assigned to this show yet</p>
          ) : (
            <div className="flex flex-col gap-1">
              {eventCrew.map((entry) => {
                const isChecked = ((formState.assigned_crew as AssignedCrewEntry[]) ?? []).some(
                  (c) => c.entity_id === entry.entity_id
                );
                return (
                  <button
                    key={entry.entity_id}
                    type="button"
                    onClick={() => handleCrewToggle(entry)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors text-left',
                      isChecked
                        ? 'bg-[oklch(1_0_0_/_0.08)] border-[var(--stage-accent)]/30'
                        : 'bg-[var(--stage-surface)] border-[oklch(1_0_0_/_0.08)] hover:border-[oklch(1_0_0_/_0.12)]'
                    )}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded flex items-center justify-center border shrink-0',
                        isChecked
                          ? 'bg-[var(--stage-accent)] border-[var(--stage-accent)]'
                          : 'border-[oklch(1_0_0_/_0.08)]'
                      )}
                    >
                      {isChecked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    <span className="flex-1 text-sm text-[var(--stage-text-primary)] truncate">{entry.display_name}</span>
                    {entry.role && (
                      <span className="stage-label px-1.5 py-0.5 rounded-full bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)] shrink-0">
                        {entry.role}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="stage-label">Notes</label>
          <textarea
            value={(formState.notes as string) ?? ''}
            onChange={(event) => updateField('notes', event.target.value)}
            rows={6}
            className={cn(
              "w-full bg-[var(--ctx-well)] rounded-md px-4 py-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors border border-[oklch(1_0_0_/_0.08)]",
              "resize-none outline-none min-h-[120px]"
            )}
            placeholder="Add cue notes..."
          />
        </div>
      </div>

      <div className="mt-auto pt-2 border-t border-[oklch(1_0_0_/_0.08)] grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onDuplicate}
          className="h-10 flex items-center justify-center gap-2 rounded-lg bg-[oklch(1_0_0_/_0.05)] hover:bg-[oklch(1_0_0_/_0.10)] text-xs font-medium text-[var(--stage-text-primary)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
        >
          <Copy size={12} strokeWidth={SW} />
          Duplicate cue
        </button>
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="stage-label">Remove permanently</span>
            <button className="stage-btn stage-btn-danger text-sm px-2 py-1" onClick={handleDelete}>Delete cue</button>
            <button className="stage-btn stage-btn-secondary text-sm px-2 py-1" onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="h-10 flex items-center justify-center gap-2 rounded-lg bg-[var(--color-unusonic-error)]/10 hover:bg-[var(--color-unusonic-error)]/15 text-xs font-medium text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <Trash2 size={12} strokeWidth={SW} />
            Delete cue
          </button>
        )}
      </div>
    </StagePanel>
  );
}

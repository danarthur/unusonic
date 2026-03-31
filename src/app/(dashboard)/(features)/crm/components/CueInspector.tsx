'use client';

import { useEffect, useMemo, useRef, useState, useOptimistic, startTransition } from 'react';
import { Clock, Mic, Sun, Video, Truck, Copy, Trash2, MousePointerClick } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import type { Cue, CueType, AssignedCrewEntry } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';

type CueInspectorProps = {
  selectedCue: Cue | null;
  computedStartTime?: string | null;
  onSave: (updates: Partial<Cue>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDuplicate: () => Promise<void>;
  eventCrew?: AssignedCrewEntry[];
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
}: CueInspectorProps) {
  const [formState, setFormState] = useState<Partial<Cue>>({});
  const [optimisticCue, setOptimisticCue] = useOptimistic<Partial<Cue>>({});
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
    });
    startTransition(() => {
      setOptimisticCue({
        title: selectedCue.title,
        duration_minutes: selectedCue.duration_minutes,
        type: selectedCue.type,
        notes: selectedCue.notes ?? '',
        assigned_crew: selectedCue.assigned_crew ?? [],
      });
    });
  }, [selectedCue, setOptimisticCue]);

  const activeType = useMemo(() => {
    const match = typeOptions.find((option) => option.value === (optimisticCue.type ?? selectedCue?.type));
    return match ?? typeOptions[0];
  }, [optimisticCue.type, selectedCue?.type]);

  const handleDelete = async () => {
    if (!selectedCue) return;
    if (!window.confirm('This will permanently remove the cue.')) return;
    await onDelete();
  };

  const scheduleSave = (updates: Partial<Cue>) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onSave(updates).catch(() => undefined);
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
          <MousePointerClick size={24} className="text-[var(--stage-text-secondary)]/70" />
          <p className="text-sm text-[var(--stage-text-secondary)]">Select a cue to edit</p>
        </div>
      </StagePanel>
    );
  }

  return (
    <StagePanel className="h-full flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">Cue Inspector</h3>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1">Adjust timing, type, and notes.</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">Starts at</p>
          <div className="font-mono text-4xl font-medium text-[var(--stage-text-primary)] tracking-tight">
            {computedStartTime ?? '--:--'}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">Title</label>
          <input
            value={(formState.title as string) ?? ''}
            onChange={(event) => updateField('title', event.target.value)}
            className="w-full bg-[var(--ctx-well)] rounded-md px-4 py-3 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] transition-colors border border-[oklch(1_0_0_/_0.08)]"
            placeholder="Cue title"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">Duration</label>
            <div className="w-full bg-[var(--ctx-well)] rounded-md px-4 py-3 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus-within:ring-2 focus-within:ring-[var(--stage-accent)] transition-colors border border-[oklch(1_0_0_/_0.08)] flex items-center gap-2">
              <Clock size={14} className="text-[var(--stage-text-secondary)]" />
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
            <label className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">Type</label>
            <div className="stage-panel stage-panel-nested !rounded-2xl !p-1 flex items-center gap-2">
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
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-xs text-[var(--stage-text-secondary)] uppercase tracking-wider">
              <activeType.icon size={12} />
              {activeType.label}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">Crew</label>
          {!eventCrew || eventCrew.length === 0 ? (
            <p className="text-xs text-[var(--stage-text-secondary)]">No crew assigned to this event yet</p>
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
                        ? 'bg-[var(--color-unusonic-info)]/10 border-[var(--color-unusonic-info)]/30'
                        : 'bg-[var(--stage-surface)] border-[oklch(1_0_0_/_0.08)] hover:border-[oklch(1_0_0_/_0.12)]'
                    )}
                  >
                    <div
                      className={cn(
                        'w-4 h-4 rounded flex items-center justify-center border shrink-0',
                        isChecked
                          ? 'bg-[var(--color-unusonic-info)] border-[var(--color-unusonic-info)]'
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider bg-[var(--color-unusonic-info)]/10 text-[var(--color-unusonic-info)] shrink-0">
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
          <label className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">Notes</label>
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
          <Copy size={12} />
          Duplicate cue
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="h-10 flex items-center justify-center gap-2 rounded-lg bg-[var(--color-unusonic-error)]/10 hover:bg-[var(--color-unusonic-error)]/15 text-xs font-medium text-[var(--color-unusonic-error)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
        >
          <Trash2 size={12} />
          Delete cue
        </button>
      </div>
    </StagePanel>
  );
}

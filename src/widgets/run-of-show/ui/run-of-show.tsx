'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { StagePanel } from '@/shared/ui/stage-panel';
import { GripVertical, Mic, Sun, Video, Truck } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { Cue, CueType } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';
import { fetchCues, updateCueOrder } from '@/app/(dashboard)/(features)/crm/actions/ros';

/* --- ICONS MAPPING --- */
const typeIcons: Record<CueType, { icon: typeof Mic; color: string; bg: string }> = {
  stage: { icon: Mic, color: 'text-[oklch(0.65_0.15_300)]', bg: 'bg-[oklch(0.65_0.15_300_/_0.1)]' },
  audio: { icon: Video, color: 'text-[oklch(0.65_0.15_250)]', bg: 'bg-[oklch(0.65_0.15_250_/_0.1)]' },
  lighting: { icon: Sun, color: 'text-[var(--color-unusonic-warning)]', bg: 'bg-[var(--color-unusonic-warning)]/10' },
  video: { icon: Video, color: 'text-[var(--color-unusonic-success)]', bg: 'bg-[var(--color-unusonic-success)]/10' },
  logistics: { icon: Truck, color: 'text-[var(--stage-text-secondary)]', bg: 'bg-[var(--stage-text-primary)]/10' },
};

const DEFAULT_START_TIME = '18:00';

const parseTimeToMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map((value) => Number(value));
  return hours * 60 + minutes;
};

const formatMinutes = (minutes: number) => {
  const safeMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

type RunOfShowProps = {
  eventId: string;
  cues?: Cue[];
  selectedCueId?: string | null;
  onSelectCue?: (cueId: string) => void;
  onCuesChange?: (cues: Cue[]) => void;
  className?: string;
};

export function RunOfShow({
  eventId,
  cues: cuesOverride,
  selectedCueId,
  onSelectCue,
  onCuesChange,
  className,
}: RunOfShowProps) {
  // SSR Safety for Drag and Drop
  const [enabled, setEnabled] = useState(false);
  const [cues, setCues] = useState<Cue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const animation = requestAnimationFrame(() => setEnabled(true));
    return () => {
      cancelAnimationFrame(animation);
      setEnabled(false);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchCues(eventId)
      .then((data) => {
        if (!active) return;
        setCues(data);
        onCuesChange?.(data);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError('Unable to load timeline');
        setCues([]);
        onCuesChange?.([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const previous = displayCues;
    const items = Array.from(displayCues);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setCues(items);
    onCuesChange?.(items);
    updateCueOrder(items).catch(() => {
      setCues(previous);
      onCuesChange?.(previous);
    });
  };

  const displayCues = cuesOverride ?? cues;

  const computedStartTimes = useMemo(() => {
    if (displayCues.length === 0) return [];
    const initialTime = displayCues[0]?.start_time ?? DEFAULT_START_TIME;
    let currentMinutes = parseTimeToMinutes(initialTime);

    return displayCues.map((cue, index) => {
      if (index === 0 && cue.start_time) {
        currentMinutes = parseTimeToMinutes(cue.start_time);
      }

      const displayTime = formatMinutes(currentMinutes);
      currentMinutes += cue.duration_minutes ?? 0;
      return displayTime;
    });
  }, [displayCues]);

  if (!enabled) return null;

  return (
    <div className={cn("flex flex-col", className)}>
      {loading ? (
        <div className="flex flex-col gap-3 pb-20">
          <StagePanel className="h-16 !p-0 stage-skeleton" padding="none" />
          <StagePanel className="h-16 !p-0 stage-skeleton" padding="none" />
          <StagePanel className="h-16 !p-0 stage-skeleton" padding="none" />
        </div>
      ) : error ? (
        <div className="py-8 text-center text-xs text-[var(--stage-text-secondary)] italic">{error}</div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="run-of-show">
            {(provided) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className="flex flex-col gap-3 px-0"
              >
                {displayCues.map((cue, index) => {
                  const Meta = typeIcons[cue.type ?? 'logistics'] ?? typeIcons.logistics;

                  return (
                    <Draggable key={cue.id} draggableId={cue.id} index={index}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={provided.draggableProps.style}
                          className="group"
                          data-cue-id={cue.id}
                        >
                          {/* Wrapper to avoid ref conflicts with DnD */}
                          <StagePanel
                            interactive
                            nested
                            className={cn(
                              "!p-3 flex items-center gap-4 transition-all duration-200",
                              snapshot.isDragging
                                ? "shadow-2xl brightness-[1.03] z-50 ring-1 ring-[var(--color-unusonic-success)]/50"
                                : "hover:border-[oklch(1_0_0_/_0.12)]",
                              cue.id === selectedCueId && "ring-1 ring-[var(--color-unusonic-success)]/40",
                              cue.id.startsWith('temp-') && "opacity-60 grayscale"
                            )}
                            onClick={() => onSelectCue?.(cue.id)}
                          >
                            {/* DRAG HANDLE */}
                            <div
                              {...provided.dragHandleProps}
                              className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] cursor-grab active:cursor-grabbing p-1"
                            >
                              <GripVertical size={18} />
                            </div>

                            {/* TIME PILL */}
                            <div className="flex flex-col items-end min-w-[60px]">
                              <span className="font-mono text-sm font-medium text-[var(--stage-text-primary)]">
                                {computedStartTimes[index] ?? DEFAULT_START_TIME}
                              </span>
                              <span className="font-mono text-[10px] text-[var(--stage-text-secondary)]">{cue.duration_minutes ?? 0}m</span>
                            </div>

                            {/* CONNECTOR */}
                            <div className="h-8 w-px bg-[var(--stage-text-primary)]/20 relative hidden md:block">
                              <div
                                className={cn(
                                  "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full",
                                  Meta.color === 'text-[var(--stage-text-secondary)]' ? 'bg-[var(--stage-text-secondary)]' : Meta.color.replace('text-', 'bg-')
                                )}
                              />
                            </div>

                            {/* CONTENT */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <h3 className="text-base font-medium text-[var(--stage-text-primary)] truncate">{cue.title}</h3>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider", Meta.bg, Meta.color)}>
                                  {cue.type}
                                </span>
                              </div>
                              {cue.notes && (
                                <p className="text-xs text-[var(--stage-text-secondary)] truncate">{cue.notes}</p>
                              )}
                            </div>
                          </StagePanel>
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}

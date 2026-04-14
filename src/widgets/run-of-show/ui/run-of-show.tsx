'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { toast } from 'sonner';
import { StagePanel } from '@/shared/ui/stage-panel';
import { GripVertical, Mic, Sun, Video, Truck, ChevronDown, ChevronRight } from 'lucide-react';

/* Shared stroke width for all icons per iconography doc */
const SW = 1.5;
import { cn } from '@/shared/lib/utils';
import type { Cue, CueType, Section } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';
import { fetchCues, updateCueOrder, fetchSections } from '@/app/(dashboard)/(features)/crm/actions/ros';
import { TimelineView } from './timeline-view';
import type { RosViewMode } from './view-toggle';

/* --- CUE TYPE COLORS (dedicated hues — never semantic status tokens) --- */
const typeIcons: Record<CueType, { icon: typeof Mic; color: string; bg: string }> = {
  stage:     { icon: Mic,   color: 'text-[oklch(0.65_0.15_300)]', bg: 'bg-[oklch(0.65_0.15_300_/_0.1)]' },
  audio:     { icon: Video, color: 'text-[oklch(0.65_0.15_250)]', bg: 'bg-[oklch(0.65_0.15_250_/_0.1)]' },
  lighting:  { icon: Sun,   color: 'text-[oklch(0.70_0.12_85)]',  bg: 'bg-[oklch(0.70_0.12_85_/_0.1)]' },
  video:     { icon: Video, color: 'text-[oklch(0.70_0.12_145)]', bg: 'bg-[oklch(0.70_0.12_145_/_0.1)]' },
  logistics: { icon: Truck, color: 'text-[var(--stage-text-secondary)]', bg: 'bg-[var(--stage-text-primary)]/10' },
};

/** Preset section accent colors (achromatic-first, subtle hue for differentiation). */
const SECTION_COLORS = [
  'oklch(0.75 0.00 0)',     // neutral
  'oklch(0.65 0.08 250)',   // cool blue
  'oklch(0.65 0.08 300)',   // violet
  'oklch(0.65 0.08 30)',    // warm
  'oklch(0.65 0.08 150)',   // teal
  'oklch(0.65 0.08 60)',    // amber
];

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
  sections?: Section[];
  selectedCueId?: string | null;
  onSelectCue?: (cueId: string) => void;
  onCuesChange?: (cues: Cue[]) => void;
  onSectionsChange?: (sections: Section[]) => void;
  readOnly?: boolean;
  viewMode?: RosViewMode;
  className?: string;
};

/** Group cues by section_id. Returns [sectionId | '__unsectioned__', cues[]] pairs sorted by section sort_order. */
function groupCuesBySections(cues: Cue[], sections: Section[]) {
  const sectionMap = new Map<string, Section>();
  for (const s of sections) sectionMap.set(s.id, s);

  const groups = new Map<string, Cue[]>();
  // Initialize section groups in sort order
  for (const s of sections) groups.set(s.id, []);
  groups.set('__unsectioned__', []);

  for (const cue of cues) {
    const key = cue.section_id && sectionMap.has(cue.section_id) ? cue.section_id : '__unsectioned__';
    const group = groups.get(key)!;
    group.push(cue);
  }

  // Return ordered: sections first (in sort_order), then unsectioned
  const result: { key: string; section: Section | null; cues: Cue[] }[] = [];
  for (const s of sections) {
    result.push({ key: s.id, section: s, cues: groups.get(s.id) ?? [] });
  }
  const unsectioned = groups.get('__unsectioned__') ?? [];
  if (unsectioned.length > 0 || sections.length === 0) {
    result.unshift({ key: '__unsectioned__', section: null, cues: unsectioned });
  }

  return result;
}

export function RunOfShow({
  eventId,
  cues: cuesOverride,
  sections: sectionsOverride,
  selectedCueId,
  onSelectCue,
  onCuesChange,
  onSectionsChange,
  readOnly = false,
  viewMode = 'list',
  className,
}: RunOfShowProps) {
  const [enabled, setEnabled] = useState(false);
  const [cues, setCues] = useState<Cue[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

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

    Promise.all([fetchCues(eventId), fetchSections(eventId)])
      .then(([cueData, sectionData]) => {
        if (!active) return;
        setCues(cueData);
        setSections(sectionData);
        onCuesChange?.(cueData);
        onSectionsChange?.(sectionData);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : 'Unable to load timeline';
        setError(message);
        setCues([]);
        setSections([]);
        onCuesChange?.([]);
        onSectionsChange?.([]);
        toast.error(message);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => { active = false; };
  }, [eventId]);

  const displayCues = cuesOverride ?? cues;
  const displaySections = sectionsOverride ?? sections;

  const grouped = useMemo(
    () => groupCuesBySections(displayCues, displaySections),
    [displayCues, displaySections]
  );

  // Build a flat ordered list for computing cumulative start times
  const flatOrderedCues = useMemo(() => {
    const flat: Cue[] = [];
    for (const group of grouped) flat.push(...group.cues);
    return flat;
  }, [grouped]);

  const computedStartTimes = useMemo(() => {
    const map = new Map<string, string>();
    if (flatOrderedCues.length === 0) return map;
    const initialTime = flatOrderedCues[0]?.start_time ?? DEFAULT_START_TIME;
    let currentMinutes = parseTimeToMinutes(initialTime);

    for (let i = 0; i < flatOrderedCues.length; i++) {
      const cue = flatOrderedCues[i];
      if (i === 0 && cue.start_time) {
        currentMinutes = parseTimeToMinutes(cue.start_time);
      }
      map.set(cue.id, formatMinutes(currentMinutes));
      currentMinutes += cue.duration_minutes ?? 0;
    }
    return map;
  }, [flatOrderedCues]);

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || readOnly) return;

    const sourceDroppableId = result.source.droppableId;
    const destDroppableId = result.destination.droppableId;
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    // Snapshot the current display state BEFORE we mutate so a server reject
    // restores exactly what the user saw, not whatever cues/cuesOverride drift
    // to between the optimistic update and the rollback.
    const snapshot = displayCues.map((c) => ({ ...c }));

    // Build mutable copy of groups
    const mutableGroups = new Map<string, Cue[]>();
    for (const g of grouped) {
      mutableGroups.set(g.key, [...g.cues]);
    }

    const sourceList = mutableGroups.get(sourceDroppableId);
    const destList = mutableGroups.get(destDroppableId);
    if (!sourceList || !destList) return;

    const [movedCue] = sourceList.splice(sourceIndex, 1);
    // Update the cue's section_id to match destination
    const newSectionId = destDroppableId === '__unsectioned__' ? null : destDroppableId;
    const updatedCue = { ...movedCue, section_id: newSectionId };
    destList.splice(destIndex, 0, updatedCue);

    // Reassemble flat list with updated sort_order
    const newFlat: Cue[] = [];
    for (const g of grouped) {
      const list = mutableGroups.get(g.key) ?? [];
      for (const cue of list) {
        newFlat.push({ ...cue, sort_order: newFlat.length });
      }
    }

    setCues(newFlat);
    onCuesChange?.(newFlat);

    updateCueOrder(newFlat).catch((err) => {
      // Rollback to the pre-drag snapshot — and tell the user the persistence
      // failed so they don't keep planning against an order the server rejected.
      setCues(snapshot);
      onCuesChange?.(snapshot);
      const message = err instanceof Error ? err.message : 'Could not save the new cue order.';
      toast.error(message);
    });
  };

  const toggleCollapse = (sectionKey: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  };

  if (!enabled) return null;

  return (
    <div className={cn('flex flex-col', className)}>
      {loading ? (
        <div className="flex flex-col gap-3 pb-20">
          <StagePanel className="h-16 !p-0 stage-skeleton" padding="none" />
          <StagePanel className="h-16 !p-0 stage-skeleton" padding="none" />
          <StagePanel className="h-16 !p-0 stage-skeleton" padding="none" />
        </div>
      ) : error ? (
        <div className="py-8 text-center text-xs text-[var(--stage-text-secondary)] italic">{error}</div>
      ) : viewMode === 'timeline' ? (
        <TimelineView
          cues={displayCues}
          sections={displaySections}
          selectedCueId={selectedCueId}
          onSelectCue={onSelectCue}
        />
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex flex-col gap-5">
            {grouped.map((group) => {
              const isCollapsed = collapsedSections.has(group.key);
              const sectionColor = group.section?.color ?? SECTION_COLORS[0];

              return (
                <div key={group.key} className="flex flex-col gap-2">
                  {/* Section header */}
                  {group.section && (
                    <button
                      type="button"
                      onClick={() => toggleCollapse(group.key)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[oklch(1_0_0_/_0.08)] transition-colors duration-[80ms] text-left group/header"
                    >
                      <div
                        className="w-1 h-5 rounded-full shrink-0"
                        style={{ backgroundColor: sectionColor }}
                      />
                      {isCollapsed
                        ? <ChevronRight size={14} strokeWidth={SW} className="text-[var(--stage-text-secondary)]" />
                        : <ChevronDown size={14} strokeWidth={SW} className="text-[var(--stage-text-secondary)]" />
                      }
                      <span className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] group-hover/header:text-[var(--stage-text-primary)] transition-colors">
                        {group.section.title}
                      </span>
                      <span className="text-label font-mono text-[var(--stage-text-secondary)] bg-[oklch(1_0_0_/_0.05)] px-1.5 py-0.5 rounded-full">
                        {group.cues.length}
                      </span>
                      {group.section.start_time && (
                        <span className="text-label font-mono text-[var(--stage-text-secondary)] ml-auto">
                          {group.section.start_time}
                        </span>
                      )}
                    </button>
                  )}
                  {group.key === '__unsectioned__' && displaySections.length > 0 && group.cues.length > 0 && (
                    <div className="flex items-center gap-2 px-2 py-1">
                      <span className="stage-label">
                        Unsectioned
                      </span>
                      <span className="text-label font-mono text-[var(--stage-text-secondary)] bg-[oklch(1_0_0_/_0.05)] px-1.5 py-0.5 rounded-full">
                        {group.cues.length}
                      </span>
                    </div>
                  )}

                  {/* Cue list (droppable) */}
                  {!isCollapsed && (
                    <Droppable droppableId={group.key} isDropDisabled={readOnly}>
                      {(provided, snapshot) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className={cn(
                            'flex flex-col gap-2 min-h-[40px] rounded-lg px-0 transition-colors',
                            snapshot.isDraggingOver && 'bg-[oklch(1_0_0_/_0.03)]',
                            group.section && 'pl-3 border-l-2',
                          )}
                          style={group.section ? { borderColor: sectionColor } : undefined}
                        >
                          {group.cues.length === 0 && (
                            <div className="py-4 text-center text-label text-[var(--stage-text-secondary)] italic">
                              {readOnly ? 'No cues' : 'Drag cues here'}
                            </div>
                          )}
                          {group.cues.map((cue, index) => {
                            const Meta = typeIcons[cue.type ?? 'logistics'] ?? typeIcons.logistics;
                            return (
                              <Draggable
                                key={cue.id}
                                draggableId={cue.id}
                                index={index}
                                isDragDisabled={readOnly || cue.id.startsWith('temp-')}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    style={provided.draggableProps.style}
                                    className="group"
                                    data-cue-id={cue.id}
                                  >
                                    <StagePanel
                                      interactive
                                      elevated
                                      className={cn(
                                        '!p-3 flex items-center gap-4 transition-colors duration-[80ms]',
                                        snapshot.isDragging
                                          ? 'shadow-2xl z-50 border border-[oklch(1_0_0_/_0.12)]'
                                          : 'hover:border-[oklch(1_0_0_/_0.12)]',
                                        cue.id === selectedCueId && 'ring-1 ring-[var(--stage-accent)]/40',
                                        cue.id.startsWith('temp-') && 'opacity-[0.45] grayscale'
                                      )}
                                      onClick={() => onSelectCue?.(cue.id)}
                                    >
                                      {/* DRAG HANDLE */}
                                      {!readOnly && (
                                        <div
                                          {...provided.dragHandleProps}
                                          className="text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] cursor-grab active:cursor-grabbing p-1"
                                        >
                                          <GripVertical size={18} strokeWidth={SW} />
                                        </div>
                                      )}

                                      {/* TIME PILL */}
                                      <div className="flex flex-col items-end min-w-[60px]">
                                        <span className="font-mono text-sm font-medium text-[var(--stage-text-primary)] tabular-nums">
                                          {computedStartTimes.get(cue.id) ?? DEFAULT_START_TIME}
                                        </span>
                                        <span className="font-mono text-label text-[var(--stage-text-secondary)]">{cue.duration_minutes ?? 0}m</span>
                                      </div>

                                      {/* CONNECTOR */}
                                      <div className="h-8 w-px bg-[var(--stage-text-primary)]/20 relative hidden md:block">
                                        <div
                                          className={cn(
                                            'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full',
                                            Meta.color === 'text-[var(--stage-text-secondary)]' ? 'bg-[var(--stage-text-secondary)]' : Meta.color.replace('text-', 'bg-')
                                          )}
                                        />
                                      </div>

                                      {/* CONTENT */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                          <h3 className="text-base font-medium text-[var(--stage-text-primary)] tracking-tight truncate">{cue.title}</h3>
                                          <span className={cn('stage-label px-1.5 py-0.5 rounded-full', Meta.bg, Meta.color)}>
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
                  )}
                </div>
              );
            })}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}

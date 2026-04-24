'use client';

import React, { useMemo } from 'react';
import { Mic, Sun, Video, Truck } from 'lucide-react';

const SW = 1.5;
import { cn } from '@/shared/lib/utils';
import type { Cue, CueType, Section } from '@/app/(dashboard)/(features)/crm/actions/run-of-show-types';

/* ── Constants ────────────────────────────────────────────────── */

/** Pixels per minute — controls visual density. */
const PX_PER_MIN = 2.5;
const MIN_CUE_HEIGHT = 32;
const DEFAULT_START_TIME = '18:00';

const typeColors: Record<CueType, string> = {
  stage:     'oklch(0.65 0.15 300)',
  audio:     'oklch(0.65 0.15 250)',
  lighting:  'oklch(0.70 0.12 85)',
  video:     'oklch(0.70 0.12 145)',
  logistics: 'var(--stage-text-secondary)',
};

const typeIcons: Record<CueType, typeof Mic> = {
  stage: Mic,
  audio: Video,
  lighting: Sun,
  video: Video,
  logistics: Truck,
};

const SECTION_COLORS_FALLBACK = 'oklch(0.75 0.00 0)';

/* ── Helpers ──────────────────────────────────────────────────── */

const parseTimeToMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const formatMinutes = (minutes: number) => {
  const safe = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

/* ── Types ────────────────────────────────────────────────────── */

interface TimelineViewProps {
  cues: Cue[];
  sections: Section[];
  selectedCueId?: string | null;
  onSelectCue?: (cueId: string) => void;
  className?: string;
}

interface CueGroup {
  key: string;
  section: Section | null;
  cues: Cue[];
}

/* ── Grouping ─────────────────────────────────────────────────── */

function groupCuesBySections(cues: Cue[], sections: Section[]): CueGroup[] {
  const sectionMap = new Map<string, Section>();
  for (const s of sections) sectionMap.set(s.id, s);

  const groups = new Map<string, Cue[]>();
  for (const s of sections) groups.set(s.id, []);
  groups.set('__unsectioned__', []);

  for (const cue of cues) {
    const key = cue.section_id && sectionMap.has(cue.section_id) ? cue.section_id : '__unsectioned__';
    groups.get(key)!.push(cue);
  }

  const result: CueGroup[] = [];
  for (const s of sections) {
    result.push({ key: s.id, section: s, cues: groups.get(s.id) ?? [] });
  }
  const unsectioned = groups.get('__unsectioned__') ?? [];
  if (unsectioned.length > 0 || sections.length === 0) {
    result.unshift({ key: '__unsectioned__', section: null, cues: unsectioned });
  }
  return result;
}

/* ── Component ────────────────────────────────────────────────── */

export function TimelineView({
  cues,
  sections,
  selectedCueId,
  onSelectCue,
  className,
}: TimelineViewProps) {
  const grouped = useMemo(() => groupCuesBySections(cues, sections), [cues, sections]);

  // Build flat cue list for cumulative time computation
  const flatCues = useMemo(() => {
    const flat: Cue[] = [];
    for (const g of grouped) flat.push(...g.cues);
    return flat;
  }, [grouped]);

  const startTimeMap = useMemo(() => {
    const map = new Map<string, number>();
    if (flatCues.length === 0) return map;
    let current = parseTimeToMinutes(flatCues[0]?.start_time ?? DEFAULT_START_TIME);
    for (let i = 0; i < flatCues.length; i++) {
      const cue = flatCues[i];
      if (i === 0 && cue.start_time) current = parseTimeToMinutes(cue.start_time);
      map.set(cue.id, current);
      current += cue.duration_minutes ?? 0;
    }
    return map;
  }, [flatCues]);

  // Compute hour markers
  const hourMarkers = useMemo(() => {
    if (flatCues.length === 0) return [];
    const firstMin = startTimeMap.get(flatCues[0].id) ?? 0;
    const lastCue = flatCues[flatCues.length - 1];
    const lastMin = (startTimeMap.get(lastCue.id) ?? 0) + (lastCue.duration_minutes ?? 0);
    const markers: { label: string; offsetPx: number }[] = [];
    // Find first hour boundary
    const firstHour = Math.ceil(firstMin / 60) * 60;
    for (let m = firstHour; m <= lastMin; m += 60) {
      markers.push({
        label: formatMinutes(m),
        offsetPx: (m - firstMin) * PX_PER_MIN,
      });
    }
    return markers;
  }, [flatCues, startTimeMap]);

  // Total height
  const totalHeight = useMemo(() => {
    return flatCues.reduce((sum, c) => sum + Math.max((c.duration_minutes ?? 0) * PX_PER_MIN, MIN_CUE_HEIGHT), 0);
  }, [flatCues]);

  if (cues.length === 0) {
    return (
      <div className={cn('py-12 text-center text-xs text-[var(--stage-text-secondary)] italic', className)}>
        No cues yet
      </div>
    );
  }

  // Track cumulative pixel offset per cue for absolute positioning
  const cumulativePx = 0;

  return (
    <div className={cn('relative', className)} style={{ minHeight: totalHeight }}>
      {/* Hour markers (gutter) */}
      {hourMarkers.map((marker) => (
        <div
          key={marker.label}
          className="absolute left-0 w-full flex items-center pointer-events-none z-0"
          style={{ top: marker.offsetPx }}
        >
          <span className="text-label font-mono text-[var(--stage-text-secondary)]/50 w-[52px] text-right pr-3 shrink-0">
            {marker.label}
          </span>
          <div className="flex-1 h-px bg-[oklch(1_0_0_/_0.06)]" />
        </div>
      ))}

      {/* Cue blocks */}
      <div className="relative pl-[56px] z-10">
        {grouped.map((group) => {
          const sectionColor = group.section?.color ?? SECTION_COLORS_FALLBACK;
          return (
            <div key={group.key} className="relative">
              {/* Section label */}
              {group.section && group.cues.length > 0 && (
                <div className="flex items-center gap-2 mb-1 mt-2">
                  <div className="w-1 h-3 rounded-full" style={{ backgroundColor: sectionColor }} />
                  <span className="stage-label">
                    {group.section.title}
                  </span>
                </div>
              )}

              {/* Section border */}
              <div
                className={cn(group.section && 'border-l-2 pl-3')}
                style={group.section ? { borderColor: sectionColor } : undefined}
              >
                {group.cues.map((cue) => {
                  const height = Math.max((cue.duration_minutes ?? 0) * PX_PER_MIN, MIN_CUE_HEIGHT);
                  const startMin = startTimeMap.get(cue.id) ?? 0;
                  const Icon = typeIcons[cue.type ?? 'logistics'] ?? typeIcons.logistics;
                  const color = typeColors[cue.type ?? 'logistics'] ?? typeColors.logistics;
                  const isSelected = cue.id === selectedCueId;

                  return (
                    <button
                      key={cue.id}
                      type="button"
                      onClick={() => onSelectCue?.(cue.id)}
                      className={cn(
                        'w-full flex items-start gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-[80ms] border',
                        isSelected
                          ? 'border-[oklch(1_0_0_/_0.15)] bg-[oklch(1_0_0_/_0.08)]'
                          : 'border-transparent hover:bg-[oklch(1_0_0_/_0.08)]',
                      )}
                      style={{ minHeight: height }}
                    >
                      {/* Time + type dot */}
                      <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0 w-[44px]">
                        <span className="text-label font-mono font-medium text-[var(--stage-text-primary)]">
                          {formatMinutes(startMin)}
                        </span>
                        <Icon size={12} strokeWidth={SW} style={{ color }} />
                      </div>

                      {/* Duration bar */}
                      <div
                        className="w-1 rounded-full shrink-0 self-stretch"
                        style={{
                          backgroundColor: color,
                          opacity: 0.4,
                          minHeight: Math.max(height - 16, 8),
                        }}
                      />

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                            {cue.title}
                          </span>
                        </div>
                        <span className="text-label font-mono text-[var(--stage-text-secondary)]">
                          {cue.duration_minutes}m
                        </span>
                        {cue.notes && height > 50 && (
                          <p className="text-label text-[var(--stage-text-secondary)] truncate mt-0.5">
                            {cue.notes}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

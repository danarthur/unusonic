'use client';

/**
 * Show-mode rendering for the program-tab cluster.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - ShowModeView — the live performance view rendered when showMode is on.
 *     Lays out moments grouped by timeline with active / next / past styling
 *     and per-moment announcements + cued songs visible in show context.
 *   - ShowModeMomentButton — single button row inside ShowModeView; private
 *     to this file.
 */

import { Radio, Mic } from 'lucide-react';
import type { ProgramMoment, ProgramTimeline, SongEntry } from '@/features/ops/lib/dj-prep-schema';
import { energyLightness } from './shared';

export function ShowModeView({
  timelines,
  activeMomentId,
  songsForMoment,
  onActivate,
}: {
  timelines: ProgramTimeline[];
  activeMomentId: string | null;
  songsForMoment: (momentId: string) => SongEntry[];
  onActivate: (momentId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 mt-4">
      {timelines.sort((a, b) => a.sort_order - b.sort_order).map((tl) => (
        <div key={tl.id} className="flex flex-col gap-2">
          {timelines.length > 1 && (
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mt-3 mb-1 px-1">
              {tl.name}
            </h3>
          )}
          {tl.moments.map((moment) => {
            const isActive = activeMomentId === moment.id;
            const allFlat = timelines.sort((a, b) => a.sort_order - b.sort_order).flatMap(t => t.moments);
            const globalIdx = allFlat.findIndex(m => m.id === moment.id);
            const activeGlobalIdx = allFlat.findIndex(m => m.id === activeMomentId);
            const isNext = !activeMomentId
              ? globalIdx === 0
              : activeGlobalIdx + 1 === globalIdx;
            const songs = songsForMoment(moment.id);

            return (
              <ShowModeMomentButton
                key={moment.id}
                moment={moment}
                isActive={isActive}
                isNext={isNext}
                songs={songs}
                onActivate={() => onActivate(moment.id)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ShowModeMomentButton({
  moment,
  isActive,
  isNext,
  songs,
  onActivate,
}: {
  moment: ProgramMoment;
  isActive: boolean;
  isNext: boolean;
  songs: SongEntry[];
  onActivate: () => void;
}) {
  return (
    <button
      onClick={onActivate}
      className={`
        flex gap-3 p-4 rounded-xl text-left transition-colors relative overflow-hidden
        ${isActive
          ? 'bg-[oklch(1_0_0/0.08)] ring-1 ring-[var(--stage-accent)]'
          : isNext
            ? 'bg-[oklch(1_0_0/0.04)]'
            : 'bg-transparent hover:bg-[oklch(1_0_0/0.03)]'
        }
      `}
    >
      {/* Energy stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: energyLightness(moment.energy) }}
      />

      <div className="flex flex-col gap-1.5 min-w-0 pl-2 flex-1">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[var(--stage-text-tertiary)] w-16 shrink-0">
            {moment.time || '—'}
          </span>
          <span className={`text-base font-semibold tracking-tight truncate ${isActive ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'}`}>
            {moment.label || 'Untitled'}
          </span>
          {isActive && <Radio className="size-3.5 text-[var(--stage-accent)] shrink-0 animate-pulse" />}
        </div>

        {/* Announcement — prominent in show mode */}
        {moment.announcement && (isActive || isNext) && (
          <div className="flex items-start gap-2 ml-[4.75rem]">
            <Mic className="size-3 text-[var(--stage-text-tertiary)] shrink-0 mt-0.5" />
            <p className="text-sm text-[var(--stage-text-primary)] leading-relaxed whitespace-pre-wrap">
              {moment.announcement}
            </p>
          </div>
        )}

        {/* Songs — compact list */}
        {songs.length > 0 && (
          <div className="flex flex-col gap-0.5 ml-[4.75rem]">
            {songs.map(song => (
              <span key={song.id} className="text-xs text-[var(--stage-text-tertiary)]">
                {song.artist ? `${song.artist} — ${song.title}` : song.title}
              </span>
            ))}
          </div>
        )}

        {/* Notes — visible for active/next */}
        {moment.notes && (isActive || isNext) && (
          <p className="text-xs text-[var(--stage-text-tertiary)] ml-[4.75rem] italic">
            {moment.notes}
          </p>
        )}
      </div>
    </button>
  );
}

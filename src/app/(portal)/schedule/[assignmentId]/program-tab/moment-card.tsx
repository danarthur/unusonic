'use client';

/**
 * Draggable moment card for the program-tab cluster.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - MomentCard — single Reorder.Item rendering one moment row in the
 *     active timeline: drag handle, time + label inputs, energy stripe,
 *     cued-song list with assign/remove actions, MC-script + notes panes,
 *     and an inline 1–10 energy selector.
 */

import { useState } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { X, Music, GripVertical, ArrowRight, Mic } from 'lucide-react';
import type { ProgramMoment, SongEntry } from '@/features/ops/lib/dj-prep-schema';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { SongSearch } from '@/features/ops/ui/song-search';
import type { SearchResult } from '@/app/api/music/search/route';
import { energyLightness, parseAndFormatTime } from './shared';

export function MomentCard({
  moment,
  songs,
  onUpdate,
  onRemove,
  onAddSong,
  onRemoveSong,
  onUnassignSong,
}: {
  moment: ProgramMoment;
  songs: SongEntry[];
  onUpdate: (updates: Partial<ProgramMoment>) => void;
  onRemove: () => void;
  onAddSong: (result: SearchResult | { title: string; artist: string }) => void;
  onRemoveSong: (songId: string) => void;
  onUnassignSong: (songId: string) => void;
}) {
  const [timeInput, setTimeInput] = useState(moment.time);
  const [notesOpen, setNotesOpen] = useState(!!moment.notes);
  const [announcementOpen, setAnnouncementOpen] = useState(!!moment.announcement);
  const dragControls = useDragControls();

  const handleTimeBlur = () => {
    const formatted = parseAndFormatTime(timeInput);
    setTimeInput(formatted);
    onUpdate({ time: formatted });
  };

  return (
    <Reorder.Item
      value={moment}
      dragListener={false}
      dragControls={dragControls}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[oklch(1_0_0/0.06)] relative overflow-hidden"
      data-surface="surface"
    >
      {/* Energy stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{ backgroundColor: energyLightness(moment.energy) }}
      />

      {/* Header row: drag handle + time + label + energy + remove */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={(e) => dragControls.start(e)}
          className="touch-none text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <input
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          onBlur={handleTimeBlur}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          placeholder="6:00 PM"
          aria-label="Moment time"
          className="w-[5.5rem] text-xs font-mono bg-transparent text-[var(--stage-text-secondary)] placeholder:text-[var(--stage-text-secondary)] outline-none border-b border-[oklch(1_0_0/0.06)] focus-visible:border-[var(--stage-accent)] pb-0.5"
        />
        <input
          value={moment.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          placeholder="e.g. First Dance, Cocktail Hour"
          aria-label="Moment label"
          className="flex-1 text-sm font-medium bg-transparent text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none border-b border-[oklch(1_0_0/0.06)] focus-visible:border-[var(--stage-accent)] pb-0.5"
        />
        <button onClick={onRemove} aria-label="Remove moment" className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] shrink-0">
          <X className="size-4" />
        </button>
      </div>

      {/* Cued songs */}
      {songs.length > 0 && (
        <div className="flex flex-col gap-1.5 ml-6 mt-1">
          {songs.map((song) => (
            <div key={song.id} className="flex items-center gap-2 text-xs group">
              {song.artwork_url ? (
                <img src={song.artwork_url} alt="" className="size-5 rounded shrink-0 object-cover" />
              ) : (
                <Music className="size-3 shrink-0 text-[var(--stage-text-tertiary)]" />
              )}
              <span className="text-[var(--stage-text-secondary)] truncate">
                {song.artist ? `${song.artist} — ${song.title}` : song.title}
              </span>
              {song.notes && (
                <span className="text-[var(--stage-text-tertiary)] truncate hidden sm:inline">({song.notes})</span>
              )}
              <div className="flex items-center gap-1 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onUnassignSong(song.id)} aria-label="Move to must-play" title="Move to must-play list" className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
                  <ArrowRight className="size-3" />
                </button>
                <button onClick={() => onRemoveSong(song.id)} aria-label="Remove song" className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]">
                  <X className="size-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add song to moment — search-enabled */}
      <div className="ml-6">
        <SongSearch
          size="sm"
          placeholder="Add song..."
          onSelect={(result) => onAddSong(result)}
        />
      </div>

      {/* Announcement script */}
      {announcementOpen ? (
        <div className="ml-6 mt-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Mic className="size-3 text-[var(--stage-text-tertiary)]" />
            <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">MC script</span>
          </div>
          <textarea
            value={moment.announcement}
            onChange={(e) => onUpdate({ announcement: e.target.value })}
            rows={2}
            placeholder="Ladies and gentlemen, please welcome for the first time..."
            className="w-full text-xs bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.04)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
          />
        </div>
      ) : null}

      {/* Per-moment notes */}
      {notesOpen ? (
        <div className="ml-6 mt-1">
          <textarea
            value={moment.notes}
            onChange={(e) => onUpdate({ notes: e.target.value })}
            rows={2}
            placeholder="Genre direction, vibe, energy notes..."
            className="w-full text-xs bg-[var(--ctx-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-secondary)] placeholder:text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.04)] outline-none focus-visible:border-[var(--stage-accent)] resize-none"
          />
        </div>
      ) : null}

      {/* Action row: add notes / add script / energy */}
      <div className="flex items-center gap-3 ml-6 flex-wrap">
        {!announcementOpen && (
          <button
            onClick={() => setAnnouncementOpen(true)}
            className="text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          >
            + MC script
          </button>
        )}
        {!notesOpen && (
          <button
            onClick={() => setNotesOpen(true)}
            className="text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          >
            + Notes
          </button>
        )}
        {/* Inline energy selector */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-[var(--stage-text-tertiary)]">Energy</span>
          <div className="flex gap-px">
            {[1,2,3,4,5,6,7,8,9,10].map(level => (
              <button
                key={level}
                onClick={() => onUpdate({ energy: moment.energy === level ? null : level })}
                aria-label={`Energy ${level}`}
                className="w-2.5 h-4 rounded-sm transition-colors"
                style={{
                  backgroundColor: (moment.energy ?? 0) >= level
                    ? energyLightness(level)
                    : 'oklch(1 0 0 / 0.06)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </Reorder.Item>
  );
}

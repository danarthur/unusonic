'use client';

/**
 * Song-list sidebar section + mobile assign picker for the program-tab cluster.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - SongListSection — bucketed song list (Must play / Play if possible /
 *     Do not play) rendered in the right rail, with a SongSearch input and
 *     per-row assign/remove actions.
 *   - MobileAssignPicker — bottom-sheet that lets a touch user pick a
 *     moment to cue an unassigned song to.
 */

import { motion } from 'framer-motion';
import { X, Music } from 'lucide-react';
import type { ProgramMoment, SongEntry, SongTier } from '@/features/ops/lib/dj-prep-schema';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { SongSearch } from '@/features/ops/ui/song-search';
import { ArrowRight } from 'lucide-react';
import type { SearchResult } from '@/app/api/music/search/route';

export function SongListSection({
  label,
  icon: Icon,
  songs,
  tier,
  onAdd,
  onRemove,
  onAssign,
  moments,
  description,
}: {
  label: string;
  icon: typeof Music;
  songs: SongEntry[];
  tier: SongTier;
  onAdd: (result: SearchResult | { title: string; artist: string }) => void;
  onRemove: (songId: string) => void;
  onAssign?: (songId: string) => void;
  moments?: ProgramMoment[];
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl bg-[var(--stage-surface-elevated)]" data-surface="elevated">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="size-4 text-[var(--stage-text-secondary)]" />
        <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">{label}</h4>
        {songs.length > 0 && (
          <span className="text-[10px] tabular-nums text-[var(--stage-text-tertiary)] ml-auto">{songs.length}</span>
        )}
      </div>

      {description && songs.length === 0 && (
        <p className="text-[10px] text-[var(--stage-text-tertiary)] -mt-1">{description}</p>
      )}

      {songs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {songs.map((song) => (
            <div key={song.id} className="flex items-center justify-between gap-2 text-sm group">
              <div className="flex items-center gap-2 min-w-0">
                {song.artwork_url ? (
                  <img src={song.artwork_url} alt="" className="size-6 rounded shrink-0 object-cover" />
                ) : null}
                <span className="text-[var(--stage-text-primary)] truncate">
                  {song.artist ? `${song.artist} — ${song.title}` : song.title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onAssign && moments && tier !== 'do_not_play' && (
                  <button
                    onClick={() => onAssign(song.id)}
                    aria-label="Assign to moment"
                    title="Assign to a moment"
                    className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 lg:opacity-0 lg:group-hover:opacity-100 max-lg:opacity-100 transition-opacity"
                  >
                    <ArrowRight className="size-3.5" />
                  </button>
                )}
                <button
                  onClick={() => onRemove(song.id)}
                  aria-label="Remove"
                  className="text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 max-lg:opacity-100 transition-opacity"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SongSearch
        placeholder={`Search or type Artist — Song`}
        onSelect={onAdd}
      />
    </div>
  );
}

export function MobileAssignPicker({
  songId,
  songPool,
  moments,
  onAssign,
  onCancel,
}: {
  songId: string;
  songPool: SongEntry[];
  moments: ProgramMoment[];
  onAssign: (songId: string, momentId: string | null) => void;
  onCancel: () => void;
}) {
  const song = songPool.find(s => s.id === songId);
  if (!song) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[oklch(0_0_0/0.6)]"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={STAGE_MEDIUM}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-t-2xl bg-[var(--stage-surface-elevated)] p-5 pb-8 safe-area-pb"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--stage-text-primary)]">
            Assign to moment
          </h3>
          <button onClick={onCancel} className="text-[var(--stage-text-tertiary)]">
            <X className="size-5" />
          </button>
        </div>

        <p className="text-xs text-[var(--stage-text-secondary)] mb-3">
          {song.artist ? `${song.artist} — ${song.title}` : song.title}
        </p>

        <div className="flex flex-col gap-1.5 max-h-[50vh] overflow-y-auto">
          {moments.map((moment) => (
            <button
              key={moment.id}
              onClick={() => onAssign(songId, moment.id)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-[oklch(1_0_0/0.04)] transition-colors"
            >
              <span className="text-xs font-mono text-[var(--stage-text-tertiary)] w-16 shrink-0">
                {moment.time || '—'}
              </span>
              <span className="text-sm text-[var(--stage-text-primary)] truncate">
                {moment.label || 'Untitled'}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

/**
 * M3U export helpers for the program-tab cluster.
 *
 * Extracted from program-tab.tsx (Phase 0.5-style split, 2026-04-29).
 *
 * Owns:
 *   - generateM3U — builds an #EXTM3U playlist body grouped by moment,
 *     with Must Play / Play If Possible buckets for unassigned songs.
 *   - downloadM3U — triggers a browser download for the generated body.
 */

import type { ProgramMoment, SongEntry } from '@/features/ops/lib/dj-prep-schema';

export function generateM3U(
  moments: ProgramMoment[],
  songPool: SongEntry[],
  eventTitle: string,
): string {
  const lines: string[] = ['#EXTM3U', `# ${eventTitle} — DJ Program Export`];

  // Cued songs grouped by moment
  for (const moment of moments) {
    const cuedSongs = songPool
      .filter(s => s.assigned_moment_id === moment.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    if (cuedSongs.length > 0) {
      lines.push('', `# --- ${moment.label}${moment.time ? ` (${moment.time})` : ''} ---`);
      for (const song of cuedSongs) {
        const display = song.artist ? `${song.artist} - ${song.title}` : song.title;
        lines.push(`#EXTINF:-1,${display}`, display);
      }
    }
  }

  // Floating must-play
  const mustPlay = songPool.filter(s => s.tier === 'must_play' && !s.assigned_moment_id);
  if (mustPlay.length > 0) {
    lines.push('', '# --- Must Play (unassigned) ---');
    for (const song of mustPlay) {
      const display = song.artist ? `${song.artist} - ${song.title}` : song.title;
      lines.push(`#EXTINF:-1,${display}`, display);
    }
  }

  // Floating play-if-possible
  const playIfPossible = songPool.filter(s => s.tier === 'play_if_possible' && !s.assigned_moment_id);
  if (playIfPossible.length > 0) {
    lines.push('', '# --- Play If Possible ---');
    for (const song of playIfPossible) {
      const display = song.artist ? `${song.artist} - ${song.title}` : song.title;
      lines.push(`#EXTINF:-1,${display}`, display);
    }
  }

  return lines.join('\n');
}

export function downloadM3U(content: string, filename: string) {
  const blob = new Blob([content], { type: 'audio/x-mpegurl' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

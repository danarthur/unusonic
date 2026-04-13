/**
 * Generate a Rekordbox-compatible XML playlist file.
 *
 * Pioneer's published format:
 * https://cdn.rekordbox.com/files/20200410160904/xml_format_list.pdf
 *
 * Structure:
 *  <DJ_PLAYLISTS Version="1.0.0">
 *    <PRODUCT Name="Unusonic" Version="1.0" Company="Unusonic"/>
 *    <COLLECTION Entries="N">
 *      <TRACK TrackID="1" Name="..." Artist="..." Location="file://..." />
 *    </COLLECTION>
 *    <PLAYLISTS>
 *      <NODE Type="0" Name="ROOT" Count="1">
 *        <NODE Name="Playlist" Type="1" Entries="N">
 *          <TRACK Key="1"/>
 *        </NODE>
 *      </NODE>
 *    </PLAYLISTS>
 *  </DJ_PLAYLISTS>
 */

import type { SongEntry, ProgramMoment } from '@/features/ops/lib/dj-prep-schema';

/** XML-escape a string */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Build a file:// URI for a track */
function buildLocation(song: SongEntry, musicRootPath: string): string {
  const root = musicRootPath.replace(/\/+$/, '');
  const artist = (song.artist || 'Unknown Artist').replace(/[/\\:*?"<>|]/g, '_');
  const title = (song.title || 'Unknown Track').replace(/[/\\:*?"<>|]/g, '_');
  const path = `${root}/${artist} - ${title}.mp3`;
  // Rekordbox expects file://localhost/ + URL-encoded path
  return `file://localhost${path.split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Generate Rekordbox XML from a DJ program.
 * Songs ordered: cued by moment, then floating must-play, then play-if-possible.
 */
export function generateRekordboxXml(
  playlistName: string,
  moments: ProgramMoment[],
  songs: SongEntry[],
  musicRootPath: string,
): string {
  // Order songs
  const ordered: SongEntry[] = [];
  for (const moment of moments) {
    ordered.push(
      ...songs
        .filter(s => s.assigned_moment_id === moment.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    );
  }
  ordered.push(...songs.filter(s => s.tier === 'must_play' && !s.assigned_moment_id));
  ordered.push(...songs.filter(s => s.tier === 'play_if_possible' && !s.assigned_moment_id));

  // Filter out do-not-play
  const tracks = ordered.filter(s => s.tier !== 'do_not_play');

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<DJ_PLAYLISTS Version="1.0.0">',
    '  <PRODUCT Name="Unusonic" Version="1.0" Company="Unusonic"/>',
    `  <COLLECTION Entries="${tracks.length}">`,
  ];

  tracks.forEach((song, i) => {
    const id = i + 1;
    const totalTime = song.duration_ms ? Math.round(song.duration_ms / 1000) : 0;
    lines.push(
      `    <TRACK TrackID="${id}" Name="${esc(song.title)}" Artist="${esc(song.artist)}"` +
      ` Album="" TotalTime="${totalTime}" Location="${esc(buildLocation(song, musicRootPath))}"/>`,
    );
  });

  lines.push('  </COLLECTION>');
  lines.push('  <PLAYLISTS>');
  lines.push('    <NODE Type="0" Name="ROOT" Count="1">');
  lines.push(`      <NODE Name="${esc(playlistName)}" Type="1" KeyType="0" Entries="${tracks.length}">`);

  tracks.forEach((_, i) => {
    lines.push(`        <TRACK Key="${i + 1}"/>`);
  });

  lines.push('      </NODE>');
  lines.push('    </NODE>');
  lines.push('  </PLAYLISTS>');
  lines.push('</DJ_PLAYLISTS>');

  return lines.join('\n');
}

/** Trigger download of a Rekordbox XML file */
export function downloadRekordboxXml(content: string, name: string) {
  const blob = new Blob([content], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.xml`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Generate a Serato DJ .crate binary file from a song list.
 *
 * Serato .crate format (from Mixxx wiki):
 *  - vrsn tag: "1.0/Serato ScratchLive Crate" in UTF-16 BE
 *  - For each track: otrk container → ptrk tag with file path in UTF-16 BE
 *  - All strings: 4-byte ASCII tag + 4-byte big-endian length + UTF-16 BE content
 *
 * Reference: https://github.com/mixxxdj/mixxx/wiki/Serato-Database-Format
 */

import type { SongEntry, ProgramMoment } from '@/features/ops/lib/dj-prep-schema';

const CRATE_VERSION = '1.0/Serato ScratchLive Crate';

/** Encode a string to UTF-16 Big Endian */
function toUtf16BE(str: string): Uint8Array {
  const buf = new ArrayBuffer(str.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < str.length; i++) {
    view.setUint16(i * 2, str.charCodeAt(i), false); // big-endian
  }
  return new Uint8Array(buf);
}

/** Write a 4-byte ASCII tag */
function tagBytes(tag: string): Uint8Array {
  return new TextEncoder().encode(tag);
}

/** Write a 4-byte big-endian length */
function lengthBytes(len: number): Uint8Array {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setUint32(0, len, false);
  return new Uint8Array(buf);
}

/** Create a tagged TLV block: [4-byte tag][4-byte length][data] */
function tlv(tag: string, data: Uint8Array): Uint8Array {
  const t = tagBytes(tag);
  const l = lengthBytes(data.byteLength);
  const out = new Uint8Array(t.byteLength + l.byteLength + data.byteLength);
  out.set(t, 0);
  out.set(l, t.byteLength);
  out.set(data, t.byteLength + l.byteLength);
  return out;
}

/** Build a plausible file path for a song */
function buildTrackPath(song: SongEntry, musicRootPath: string): string {
  const root = musicRootPath.replace(/\/+$/, '');
  const artist = (song.artist || 'Unknown Artist').replace(/[/\\:*?"<>|]/g, '_');
  const title = (song.title || 'Unknown Track').replace(/[/\\:*?"<>|]/g, '_');
  return `${root}/${artist} - ${title}.mp3`;
}

/**
 * Generate a Serato .crate file as a Blob.
 * Songs are ordered: cued songs by moment order, then must-play, then play-if-possible.
 */
export function generateSeratoCrate(
  crateName: string,
  moments: ProgramMoment[],
  songs: SongEntry[],
  musicRootPath: string,
): Blob {
  const parts: Uint8Array[] = [];

  // Version header
  parts.push(tlv('vrsn', toUtf16BE(CRATE_VERSION)));

  // Order songs: cued by moment order, then floating
  const ordered: SongEntry[] = [];
  for (const moment of moments) {
    const cuedForMoment = songs
      .filter(s => s.assigned_moment_id === moment.id)
      .sort((a, b) => a.sort_order - b.sort_order);
    ordered.push(...cuedForMoment);
  }
  ordered.push(...songs.filter(s => s.tier === 'must_play' && !s.assigned_moment_id));
  ordered.push(...songs.filter(s => s.tier === 'play_if_possible' && !s.assigned_moment_id));

  // Track entries
  for (const song of ordered) {
    if (song.tier === 'do_not_play') continue;
    const path = buildTrackPath(song, musicRootPath);
    const ptrk = tlv('ptrk', toUtf16BE(path));
    const otrk = tlv('otrk', ptrk);
    parts.push(otrk);
  }

  // Combine all parts
  const totalLength = parts.reduce((acc, p) => acc + p.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return new Blob([result], { type: 'application/octet-stream' });
}

/** Trigger download of a Serato .crate file */
export function downloadCrate(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.crate`;
  a.click();
  URL.revokeObjectURL(url);
}

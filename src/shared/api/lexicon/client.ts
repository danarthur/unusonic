/**
 * Lexicon DJ Local API client — browser-side.
 * Communicates with Lexicon's REST API at localhost:48624 when the desktop app is running.
 * All functions fail silently (return null/false/empty) if Lexicon is not available or CORS blocks.
 *
 * API docs: https://lexicondj.com/docs/developers/api
 * @module shared/api/lexicon/client
 */

const LEXICON_BASE = 'http://localhost:48624/v1';
const DETECT_TIMEOUT_MS = 2000;

/* ── Types ──────────────────────────────────────────────────────── */

export type LexiconTrack = {
  id: number;
  title: string;
  artist: string;
  albumTitle: string;
  bpm: number | null;
  key: string | null;
  genre: string | null;
  duration: number | null;
  energy: number | null;
  location: string;
};

export type LexiconPlaylist = {
  id: number;
  name: string;
  type: number; // 1=folder, 2=playlist, 3=smartlist
  children?: LexiconPlaylist[];
};

/* ── Detection ──────────────────────────────────────────────────── */

let cachedAvailability: boolean | null = null;

/**
 * Probe whether Lexicon is running and accessible.
 * Caches the result for the browser session.
 */
export async function isLexiconAvailable(): Promise<boolean> {
  if (cachedAvailability !== null) return cachedAvailability;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);

    const res = await fetch(`${LEXICON_BASE}/tracks?limit=1&fields=id`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    cachedAvailability = res.ok;
    return cachedAvailability;
  } catch {
    cachedAvailability = false;
    return false;
  }
}

/** Reset the cached detection (useful after user enables Lexicon API). */
export function resetLexiconDetection() {
  cachedAvailability = null;
}

/* ── Track Search ───────────────────────────────────────────────── */

/**
 * Search Lexicon's library by title and artist (case-insensitive substring).
 * Returns matching tracks, or empty array on failure.
 */
export async function searchLexiconTracks(
  artist: string,
  title: string,
): Promise<LexiconTrack[]> {
  try {
    const params = new URLSearchParams();
    if (title) params.set('filter[title]', title);
    if (artist) params.set('filter[artist]', artist);
    params.set('fields', 'id,title,artist,albumTitle,bpm,key,duration,location');
    params.set('limit', '10');

    const res = await fetch(`${LEXICON_BASE}/search/tracks?${params.toString()}`);
    if (!res.ok) return [];

    const data = await res.json();
    return (data?.data?.tracks ?? []) as LexiconTrack[];
  } catch {
    return [];
  }
}

/**
 * Find the best matching track in Lexicon for a given song.
 * Tries exact title+artist first, then title-only as fallback.
 */
export async function findBestMatch(
  artist: string,
  title: string,
): Promise<LexiconTrack | null> {
  // Try title+artist
  const results = await searchLexiconTracks(artist, title);
  if (results.length > 0) return results[0];

  // Fallback: title only (in case artist name differs slightly)
  if (artist) {
    const titleOnly = await searchLexiconTracks('', title);
    if (titleOnly.length > 0) return titleOnly[0];
  }

  return null;
}

/* ── Playlists ──────────────────────────────────────────────────── */

/**
 * Get all playlists as a recursive tree.
 */
export async function getLexiconPlaylists(): Promise<LexiconPlaylist[]> {
  try {
    const res = await fetch(`${LEXICON_BASE}/playlists`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.data?.playlists ?? []) as LexiconPlaylist[];
  } catch {
    return [];
  }
}

/**
 * Find a playlist by path (e.g., ["Unusonic", "Event Name"]).
 * Returns null if not found.
 */
export async function findPlaylistByPath(path: string[]): Promise<LexiconPlaylist | null> {
  try {
    const params = path.map(p => `path=${encodeURIComponent(p)}`).join('&');
    const res = await fetch(`${LEXICON_BASE}/playlist-by-path?${params}&type=2`);
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.data?.playlist ?? null) as LexiconPlaylist | null;
  } catch {
    return null;
  }
}

/**
 * Create a playlist (or folder).
 * Returns the new playlist ID, or null on failure.
 */
export async function createPlaylist(
  name: string,
  type: '1' | '2' = '2', // 1=folder, 2=playlist
  parentId?: number,
): Promise<number | null> {
  try {
    const body: Record<string, unknown> = { name, type };
    if (parentId) body.parentId = parentId;

    const res = await fetch(`${LEXICON_BASE}/playlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data?.data?.id ?? null) as number | null;
  } catch {
    return null;
  }
}

/**
 * Add tracks to a playlist by their Lexicon track IDs.
 */
export async function addTracksToPlaylist(
  playlistId: number,
  trackIds: number[],
): Promise<boolean> {
  if (trackIds.length === 0) return true;

  try {
    const res = await fetch(`${LEXICON_BASE}/playlist-tracks`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: playlistId, trackIds }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ── High-level: Push a program to Lexicon ──────────────────────── */

export type PushResult = {
  ok: boolean;
  matched: number;
  unmatched: string[];
  playlistName: string;
};

/**
 * Push a DJ program's songs to Lexicon as a playlist.
 * Creates an "Unusonic" folder if needed, then a playlist named after the event.
 * Matches songs by title+artist against Lexicon's library.
 */
export async function pushProgramToLexicon(
  eventTitle: string,
  songs: { title: string; artist: string }[],
): Promise<PushResult> {
  const result: PushResult = { ok: false, matched: 0, unmatched: [], playlistName: eventTitle };

  // 1. Ensure "Unusonic" folder exists
  const playlists = await getLexiconPlaylists();
  let folderId: number | null = null;

  const existingFolder = playlists.find(p => p.name === 'Unusonic' && p.type === 1);
  if (existingFolder) {
    folderId = existingFolder.id;
  } else {
    folderId = await createPlaylist('Unusonic', '1');
    if (!folderId) return result;
  }

  // 2. Check if playlist already exists, or create new
  const existingPlaylist = await findPlaylistByPath(['Unusonic', eventTitle]);
  let playlistId: number | null;

  if (existingPlaylist) {
    playlistId = existingPlaylist.id;
  } else {
    playlistId = await createPlaylist(eventTitle, '2', folderId);
    if (!playlistId) return result;
  }

  // 3. Match songs against Lexicon's library
  const matchedIds: number[] = [];
  const unmatched: string[] = [];

  for (const song of songs) {
    const match = await findBestMatch(song.artist, song.title);
    if (match) {
      matchedIds.push(match.id);
    } else {
      unmatched.push(song.artist ? `${song.artist} — ${song.title}` : song.title);
    }
  }

  // 4. Add matched tracks to playlist
  const added = await addTracksToPlaylist(playlistId, matchedIds);
  if (!added) return result;

  result.ok = true;
  result.matched = matchedIds.length;
  result.unmatched = unmatched;
  return result;
}

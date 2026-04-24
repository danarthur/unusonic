/**
 * DJ-side dual-array song loader for the program tab.
 *
 * Reads BOTH `dj_song_pool` and `client_song_requests` from an event's
 * `run_of_show_data` JSONB, normalizes them through the canonical
 * `normalizeSongPool` helper (which coerces legacy entries to
 * `added_by: 'dj'`), and returns them as two separate arrays.
 *
 * **Why two separate arrays and not a merged pool:**
 *
 * Per Songs design doc §4.2 + §9.4, the DJ's `saveDjPrep` path must
 * never touch `client_song_requests` — that array is exclusively owned
 * by the couple's `client_songs_*` RPCs and the DJ's
 * `ops_songs_promote_client_request` RPC. If the loader returned a
 * merged pool the DJ's autosave would re-serialize couple entries and
 * clobber concurrent couple adds. Keeping them separated at the loader
 * boundary makes it impossible for program-tab state to accidentally
 * mingle the two sides.
 *
 * Slice 12 will consume this helper from the program-tab server
 * component / loader chain, passing `clientRequests` as a dedicated
 * `initialClientRequests` prop that the UI renders as a read-only
 * "from couple" section alongside the DJ-owned pool.
 *
 * Multi-tenant safety: the caller is an authenticated workspace member
 * (DJ staff session), so the standard `ops.events` RLS applies via
 * `getSystemClient()` bypass. Every read is scoped by the event id
 * passed in; the caller is responsible for having already validated
 * that the staff user has access to this event (normally via the
 * program-tab route authentication chain).
 *
 * @module features/ops/api/get-event-song-data
 */
import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import {
  normalizeSongPool,
  type SongEntry,
} from '@/features/ops/lib/dj-prep-schema';

export type EventSongData = {
  /** DJ-owned song pool — wholesale-overwritten by `saveDjPrep`. */
  djSongPool: SongEntry[];
  /** Couple-owned song requests — only the Songs RPCs touch this array. */
  clientRequests: SongEntry[];
};

/**
 * Fetch both song arrays for an event. Returns empty arrays if the
 * event doesn't exist or has no song data yet (new event, first load).
 *
 * Null-safe on every layer: a missing `run_of_show_data`, a missing
 * `dj_song_pool` key, or a non-array value all collapse to `[]`.
 */
export async function getEventSongData(eventId: string): Promise<EventSongData> {
  if (!eventId) return { djSongPool: [], clientRequests: [] };

  const supabase = getSystemClient();
  // ops schema isn't in the public Database type surface.
   
  const crossSchema = supabase;

  const { data } = await crossSchema
    .schema('ops')
    .from('events')
    .select('run_of_show_data')
    .eq('id', eventId)
    .maybeSingle();

  if (!data) return { djSongPool: [], clientRequests: [] };

  const ros = (data.run_of_show_data ?? {}) as Record<string, unknown>;

  return {
    djSongPool: normalizeSongPool(ros.dj_song_pool),
    clientRequests: normalizeSongPool(ros.client_song_requests),
  };
}

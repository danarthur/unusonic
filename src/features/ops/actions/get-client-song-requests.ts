'use server';

/**
 * Fetch the current `client_song_requests` array for an event.
 *
 * Called from the DJ program tab every 30 seconds to close the A8
 * stale-view gap — a DJ who leaves the tab open for hours would
 * otherwise miss couple additions made after the initial page load.
 *
 * Scope: deliberately returns ONLY the couple-owned array, not the
 * DJ's own pool. The DJ's pool is the authoritative local state on
 * the client side (they're actively editing it in the same tab). Mixing
 * in a polled server copy would fight the DJ's local edits during the
 * 3-second autosave window.
 *
 * Security: authenticated staff only. Uses the standard server client
 * which applies RLS — cross-workspace events will return null rows.
 * Defense-in-depth against stray calls with forged event ids.
 *
 * @module features/ops/actions/get-client-song-requests
 */
import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { normalizeSongPool, type SongEntry } from '@/features/ops/lib/dj-prep-schema';

export type GetClientSongRequestsResult =
  | { ok: true; requests: SongEntry[] }
  | { ok: false; reason: 'not_found' | 'not_authenticated' };

export async function getClientSongRequestsForEvent(
  eventId: string,
): Promise<GetClientSongRequestsResult> {
  if (!eventId) return { ok: false, reason: 'not_found' };

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, reason: 'not_authenticated' };
  }

  // Cross-schema read — ops schema isn't in the generated Database surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const crossSchema = supabase;
  const { data } = await crossSchema
    .schema('ops')
    .from('events')
    .select('run_of_show_data')
    .eq('id', eventId)
    .maybeSingle();

  if (!data) return { ok: false, reason: 'not_found' };

  const ros = (data.run_of_show_data ?? {}) as Record<string, unknown>;
  return { ok: true, requests: normalizeSongPool(ros.client_song_requests) };
}

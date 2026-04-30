/**
 * Client-safe projection for song requests.
 *
 * Transforms a raw `SongEntry` from `run_of_show_data.client_song_requests`
 * into the allow-listed `ClientSongRequest` shape the couple can read.
 *
 * **Never pass `SongEntry` across the client boundary.** Staff-only fields
 * (`assigned_moment_id`, `sort_order`, DJ-written `notes` on `dj_song_pool`
 * entries, etc.) must not serialize into a client response. This module is
 * the only place the boundary is crossed — any new client-facing surface
 * that needs to read a song entry MUST go through `toClientSongRequest()`.
 *
 * See `docs/reference/client-portal-songs-design.md` §6 for the allow-list
 * rationale and §0 A2 for the acknowledgement loop fields.
 *
 * **Pure module, no DB access, no `server-only`.** Intentionally usable
 * from client components so optimistic UI can reconcile shapes without a
 * round trip.
 *
 * @module features/client-portal/lib/client-songs
 */

import type {
  SongEntry,
  SpecialMomentLabel,
} from '@/features/ops/lib/dj-prep-schema';
import { normalizeSongEntry } from '@/features/ops/lib/dj-prep-schema';
import type { ClientSongTier } from '@/shared/types/song-tiers';
export type { ClientSongTier };

/**
 * The only song fields the couple ever sees. Explicitly excluded from
 * this shape (intentional, do not add back without §6 review):
 *
 *   - `assigned_moment_id` — DJ internal staging, leaks program structure
 *   - `sort_order` — DJ arrangement, not meaningful to the couple
 *   - `added_by` — tautologically 'couple' on this projection, so omitting
 *     prevents a future "lie waiting to happen" if a filter breaks
 *   - Any field on `dj_song_pool` — that array never crosses this boundary
 *   - DJ-written `notes` on a `dj_song_pool` entry that happens to match
 *     the same track
 */
export type ClientSongRequest = {
  id: string;
  title: string;
  artist: string;
  tier: ClientSongTier;
  notes: string;
  specialMomentLabel: SpecialMomentLabel | null;
  requestedAt: string | null;           // ISO 8601
  requestedByLabel: string | null;      // "Maya" / "Jordan" / "via Priya"
  isLateAdd: boolean;
  acknowledgedAt: string | null;        // ISO 8601; null if DJ hasn't seen
  acknowledgedMomentLabel: SpecialMomentLabel | null;
  // Streaming art for the UI only — same fields are public metadata from
  // the music search provider, so exposing them leaks nothing new.
  artworkUrl: string | null;
  durationMs: number | null;
  previewUrl: string | null;
  spotifyId: string | null;
  appleMusicId: string | null;
  isrc: string | null;
  /** Derived client-side — the lock state of the enclosing event. */
  editable: boolean;
};

/**
 * Coerce an unknown tier value into a valid `ClientSongTier`. Rejects
 * `cued` (DJ-only) and anything outside the whitelist. Returns null
 * so the caller can filter out unsafe entries rather than crashing.
 */
function coerceClientTier(tier: string | null | undefined): ClientSongTier | null {
  switch (tier) {
    case 'must_play':
    case 'play_if_possible':
    case 'do_not_play':
    case 'special_moment':
      return tier;
    default:
      return null;
  }
}

/**
 * Project a single raw entry (from JSONB) to the client-safe shape.
 * Returns null for entries that must not reach the couple:
 *
 *   - `added_by !== 'couple'` — DJ or planner entries never surface here
 *   - `tier === 'cued'` — DJ internal staging
 *   - Missing required fields
 *
 * Callers should filter out nulls and render the surviving list.
 *
 * The `editable` flag is the **caller's** responsibility — pass it in
 * via `opts.editable` so the UI can derive it once at page level from
 * the shared `computeEventLock()` state rather than per-row here.
 */
export function toClientSongRequest(
  raw: unknown,
  opts: { editable: boolean },
): ClientSongRequest | null {
  const entry: SongEntry = normalizeSongEntry(raw);

  // Only couple-added entries cross the boundary. DJ + planner are private.
  if (entry.added_by !== 'couple') return null;

  const tier = coerceClientTier(entry.tier);
  if (!tier) return null;

  if (!entry.id || !entry.title) return null;

  return {
    id: entry.id,
    title: entry.title,
    artist: entry.artist ?? '',
    tier,
    notes: entry.notes ?? '',
    specialMomentLabel: entry.special_moment_label ?? null,
    requestedAt: entry.requested_at ?? null,
    requestedByLabel: entry.requested_by_label ?? null,
    isLateAdd: Boolean(entry.is_late_add),
    acknowledgedAt: entry.acknowledged_at ?? null,
    acknowledgedMomentLabel: entry.acknowledged_moment_label ?? null,
    artworkUrl: entry.artwork_url ?? null,
    durationMs: entry.duration_ms ?? null,
    previewUrl: entry.preview_url ?? null,
    spotifyId: entry.spotify_id ?? null,
    appleMusicId: entry.apple_music_id ?? null,
    isrc: entry.isrc ?? null,
    editable: opts.editable,
  };
}

/**
 * Project a whole array. Null entries are filtered out so the caller
 * gets a clean `ClientSongRequest[]`. Invalid input → empty array.
 */
export function toClientSongRequests(
  raw: unknown,
  opts: { editable: boolean },
): ClientSongRequest[] {
  if (!Array.isArray(raw)) return [];
  const out: ClientSongRequest[] = [];
  for (const item of raw) {
    const projected = toClientSongRequest(item, opts);
    if (projected) out.push(projected);
  }
  return out;
}

/**
 * Bucket a list of client song requests by tier for grouped rendering.
 * Preserves the original array order within each bucket.
 *
 * `special_moment` entries land in their own bucket so the UI can pin
 * them above the `must_play` group (the "first dance is a moment, not
 * a must-play" principle from the research team A4/B1).
 */
export function groupByClientTier(
  requests: readonly ClientSongRequest[],
): Record<ClientSongTier, ClientSongRequest[]> {
  const out: Record<ClientSongTier, ClientSongRequest[]> = {
    special_moment: [],
    must_play: [],
    play_if_possible: [],
    do_not_play: [],
  };
  for (const r of requests) {
    out[r.tier].push(r);
  }
  return out;
}

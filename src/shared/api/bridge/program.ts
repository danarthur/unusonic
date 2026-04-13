/**
 * Bridge program projection.
 *
 * Canonical shape returned by `/api/bridge/programs` and consumed by the
 * Bridge Tauri client. This file is the source of truth for the wire format;
 * the Rust side mirrors it via serde.
 *
 * Projected down from the portal's richer `SongEntry` / `ProgramMoment`
 * shapes (defined in `features/ops/lib/dj-prep-schema.ts`) so we don't
 * leak portal-internal fields (spotify_id, artwork_url, preview_url) over
 * the wire or couple Bridge to every new column the portal adds.
 *
 * @module shared/api/bridge/program
 */

import 'server-only';
import { z } from 'zod';

/**
 * Bridge wire tier enum — DELIBERATELY narrower than the portal's
 * `SongTier` type. The portal added `'special_moment'` on 2026-04-10 for the
 * client portal Songs slice (client-portal-songs-design.md §0 B1), but the
 * Tauri Bridge client mirrors this schema via Rust serde and does not yet
 * know about special-moment entries.
 *
 * `projectSongPool` below uses `safeParse` and drops entries that fail
 * validation — which means any `special_moment`-tiered song is silently
 * excluded from the Bridge payload. That's the safe default: the Bridge
 * client would otherwise panic on an unknown variant.
 *
 * To expose special-moment entries to the Bridge: (1) update the Rust side
 * of the serde mirror, (2) ship a coordinated migration, (3) add the enum
 * value here. Do NOT add `'special_moment'` here without the Rust-side
 * change or you will break every Bridge client on next sync.
 */
export const SongTierSchema = z.enum(['cued', 'must_play', 'play_if_possible', 'do_not_play']);

export const BridgeSongEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  artist: z.string(),
  tier: SongTierSchema,
  assigned_moment_id: z.string().nullable(),
  sort_order: z.number(),
  isrc: z.string().nullable().optional(),
  duration_ms: z.number().nullable().optional(),
});

export const BridgeProgramMomentSchema = z.object({
  id: z.string(),
  label: z.string(),
  time: z.string(),
  notes: z.string().default(''),
  announcement: z.string().default(''),
  energy: z.number().nullable().optional(),
  sort_order: z.number(),
});

export const BridgeProgramSchema = z.object({
  eventId: z.string(),
  eventTitle: z.string(),
  eventDate: z.string(),
  eventEndDate: z.string().nullable(),
  venueName: z.string().nullable(),
  callTime: z.string().nullable(),
  moments: z.array(BridgeProgramMomentSchema),
  songPool: z.array(BridgeSongEntrySchema),
  hash: z.string(),
});

export type BridgeSongEntry = z.infer<typeof BridgeSongEntrySchema>;
export type BridgeProgramMoment = z.infer<typeof BridgeProgramMomentSchema>;
export type BridgeProgram = z.infer<typeof BridgeProgramSchema>;

/**
 * Safely project an unknown array of song entries from JSONB through the
 * Zod schema. Drops entries that fail validation and logs a warning.
 */
export function projectSongPool(raw: unknown): BridgeSongEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: BridgeSongEntry[] = [];
  for (const item of raw) {
    const parsed = BridgeSongEntrySchema.safeParse(item);
    if (parsed.success) {
      out.push(parsed.data);
    } else {
      console.warn('[bridge/program] Dropping malformed SongEntry:', parsed.error.issues);
    }
  }
  return out;
}

/** Same pattern for program moments. */
export function projectMoments(raw: unknown): BridgeProgramMoment[] {
  if (!Array.isArray(raw)) return [];
  const out: BridgeProgramMoment[] = [];
  for (const item of raw) {
    const parsed = BridgeProgramMomentSchema.safeParse(item);
    if (parsed.success) {
      out.push(parsed.data);
    } else {
      console.warn('[bridge/program] Dropping malformed ProgramMoment:', parsed.error.issues);
    }
  }
  return out;
}

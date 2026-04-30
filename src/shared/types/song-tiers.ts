/**
 * Song-pool vocabulary types — schema-defined enums shared across the
 * DJ prep, client portal, and server-side mutation pipeline layers.
 *
 * Lives in `shared` because the client-portal mutation helpers in
 * `shared/lib/client-portal/song-request-helpers.ts` reference them as
 * part of the input shapes for `client_songs_*` RPCs, and shared cannot
 * import from features.
 *
 * Canonical home for both types. `features/ops/lib/dj-prep-schema.ts`
 * and `features/client-portal/lib/client-songs.ts` re-export from here
 * so call sites keep their existing imports.
 *
 * @module shared/types/song-tiers
 */

/**
 * Structured label for program moments — used by BOTH the couple's
 * `special_moment` tier sub-label AND the DJ's acknowledgement moment
 * label.
 *
 * Fixed allow-list — every RPC that accepts a moment label validates
 * against this set. Values outside are rejected with
 * `reason: 'invalid_special_moment_label'` (couple side) or
 * `reason: 'invalid_moment_label'` (DJ side).
 */
export type SpecialMomentLabel =
  | 'first_dance'
  | 'parent_dance_1'
  | 'parent_dance_2'
  | 'processional'
  | 'recessional'
  | 'last_dance'
  | 'entrance'
  | 'dinner'
  | 'cake_cut'
  | 'dance_floor'
  | 'other';

/**
 * Tier vocabulary the couple can use. `cued` is DJ-only and is NEVER
 * projected to the couple — entries with `tier='cued'` are filtered out
 * of the client-safe projection.
 *
 * `special_moment` is accepted on both sides — it's the structured
 * "first dance / parent dance / etc." entry point. See
 * `SpecialMomentLabel` for the fixed allow-list.
 */
export type ClientSongTier =
  | 'must_play'
  | 'play_if_possible'
  | 'do_not_play'
  | 'special_moment';

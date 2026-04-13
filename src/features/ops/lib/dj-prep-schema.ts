/* ── V2 Types ───────────────────────────────────────────────────── */

/**
 * Tier of a song in the pool.
 *
 * - `cued` — DJ has slotted this into a specific moment
 * - `must_play` — must be played at some point
 * - `play_if_possible` — play if time/vibe allows
 * - `do_not_play` — hard veto
 * - `special_moment` — a moment-anchored request (first dance, parent dance,
 *   processional, etc.). When a song has this tier it MUST also set
 *   `special_moment_label` — the RPC enforces this invariant; the type keeps
 *   the label optional so other tiers can leave it null.
 *
 * Couple-facing RPCs reject `cued` (DJ-only) but accept every other tier.
 * See `docs/reference/client-portal-songs-design.md` §4.4 + §0 B1.
 */
export type SongTier =
  | 'cued'
  | 'must_play'
  | 'play_if_possible'
  | 'do_not_play'
  | 'special_moment';

/**
 * Structured label for program moments — used by BOTH the couple's
 * `special_moment` tier sub-label AND the DJ's acknowledgement moment
 * label (see `acknowledged_moment_label` below and §0 A2).
 *
 * **Unified on 2026-04-10** — the initial slice-5 migration used a
 * narrower 7-value list but the slice-6 DJ acknowledgement work required
 * the broader reception-program vocabulary (entrance, dinner, cake_cut,
 * dance_floor). Both RPCs now validate against this same 11-value set
 * so the two sides of the workflow can never drift.
 *
 * Fixed allow-list — every RPC that accepts a moment label validates
 * against this set. Any value outside is rejected with
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
 * Who added a song to the pool.
 *
 * - `dj` — the DJ or other staff member on the program tab
 * - `couple` — the client via the client portal `/client/songs` page
 * - `planner` — a wedding/event planner acting on behalf of the couple
 *   (reserved; not used in this slice)
 *
 * Drives the "from {first name}" chip on the staff side (§0 A5). This is the
 * only field the couple's RPCs are allowed to write as `'couple'`; any other
 * value in a couple RPC is rejected.
 *
 * Required on all new writes. Legacy entries in JSONB that lack the field
 * are coerced to `'dj'` at the loader boundary (read path), not here.
 */
export type SongAddedBy = 'dj' | 'couple' | 'planner';

export type SongEntry = {
  id: string;
  title: string;
  artist: string;
  tier: SongTier;
  assigned_moment_id: string | null;
  sort_order: number;
  notes: string;

  // ── Attribution (added 2026-04-10 for client portal Songs slice) ───────
  /** Who added this song. Required. Legacy entries read as `'dj'`. */
  added_by: SongAddedBy;
  /** Display label for the couple-side author, e.g. "Maya" / "Jordan". */
  requested_by_label?: string | null;
  /** ISO 8601 timestamp stamped by the RPC on couple adds. */
  requested_at?: string | null;

  // ── Client portal lifecycle (added 2026-04-10; §0 A1, A2) ──────────────
  /**
   * True if this couple-added entry was submitted inside the final 24 hours
   * before `starts_at`. Not a hard lock — surfaces a "late requests" chip
   * in the DJ program tab for triage. Stamped by the RPC.
   */
  is_late_add?: boolean;
  /**
   * ISO 8601 timestamp set when the DJ calls
   * `ops_songs_acknowledge_client_request`. Drives the couple-side
   * "Priya has this" marker. Null for un-acknowledged couple entries and
   * all DJ-added entries.
   */
  acknowledged_at?: string | null;
  /**
   * Whitelisted moment label set by the DJ on acknowledgement. Surfaced to
   * the couple as "Priya added this to first dance" etc. Allow-list enforced
   * by the acknowledgement RPC; see §0 A2.
   */
  acknowledged_moment_label?: SpecialMomentLabel | null;

  // ── Special moment sub-label (added 2026-04-10; §0 B1) ─────────────────
  /**
   * Required when `tier === 'special_moment'`. Validated by the RPC.
   * Couples use this to express structured intent for first dance, parent
   * dances, processional, etc. without leaking DJ moment IDs across the
   * client boundary.
   */
  special_moment_label?: SpecialMomentLabel | null;

  // ── Streaming service metadata (optional — songs can still be plain text)
  spotify_id?: string | null;
  apple_music_id?: string | null;
  isrc?: string | null;
  artwork_url?: string | null;
  duration_ms?: number | null;
  preview_url?: string | null;
};

export type ProgramMoment = {
  id: string;
  label: string;
  time: string;
  notes: string;
  announcement: string;
  energy: number | null;
  sort_order: number;
};

export type DjClientInfo = {
  couple_names: string;
  pronunciation: string;
  wedding_party: string;
  special_requests: string;
};

export type DjProgramData = {
  dj_program_version: 2;
  dj_program_moments: ProgramMoment[];
  dj_song_pool: SongEntry[];
  dj_client_info: DjClientInfo;
  dj_client_notes: string;
  dj_spotify_link: string | null;
  dj_apple_music_link: string | null;
  dj_active_moment_id: string | null;
};

/* ── V3 Types (multi-timeline) ─────────────────────────────────── */

export type ProgramTimeline = {
  id: string;
  name: string;
  moments: ProgramMoment[];
  sort_order: number;
};

export type DjProgramDataV3 = {
  dj_program_version: 3;
  dj_program_timelines: ProgramTimeline[];
  dj_program_moments: ProgramMoment[];       // flattened copy for Bridge API compat
  dj_song_pool: SongEntry[];
  dj_client_info: DjClientInfo;              // legacy — kept for backward compat reads
  dj_client_details: ClientDetails;          // archetype-aware client info
  dj_client_notes: string;
  dj_spotify_link: string | null;
  dj_apple_music_link: string | null;
  dj_active_moment_id: string | null;
  dj_active_timeline_id: string | null;
};

export type DjTimelineTemplate = {
  id: string;
  name: string;
  timelines: {
    name: string;
    moments: { label: string; energy: number | null }[];
  }[];
  created_at: string;
};

/* ── Archetype-Aware Client Details ─────────────────────────────── */

/** Base fields every archetype gets. */
export type ClientDetailsBase = {
  primary_contact_name: string;
  primary_contact_phone: string;
  primary_contact_email: string;
  pronunciation: string;
  special_requests: string;
  notes: string;
};

export type WeddingClientDetails = ClientDetailsBase & {
  archetype: 'wedding';
  couple_name_a: string;
  couple_name_b: string;
  bridal_party: string;
  parents: string;
  officiant_name: string;
};

export type CorporateClientDetails = ClientDetailsBase & {
  archetype: 'corporate';
  company_name: string;
  event_contact_name: string;
  event_contact_title: string;
  vip_names: string;
  dress_code: string;
};

export type SocialClientDetails = ClientDetailsBase & {
  archetype: 'social';
  honoree_name: string;
  guest_of_honor_pronunciation: string;
  dress_code: string;
  vip_names: string;
};

export type PerformanceClientDetails = ClientDetailsBase & {
  archetype: 'performance';
  promoter_name: string;
  artist_liaison: string;
  headliner: string;
  set_restrictions: string;
};

export type GenericClientDetails = ClientDetailsBase & {
  archetype: 'generic';
};

export type ClientDetails =
  | WeddingClientDetails
  | CorporateClientDetails
  | SocialClientDetails
  | PerformanceClientDetails
  | GenericClientDetails;

/** Map event archetype string → client detail schema group. */
export function archetypeToGroup(archetype: string | null): ClientDetails['archetype'] {
  switch (archetype) {
    case 'wedding': return 'wedding';
    case 'corporate_gala':
    case 'product_launch':
    case 'conference':
    case 'awards_show': return 'corporate';
    case 'birthday':
    case 'private_dinner':
    case 'charity_gala': return 'social';
    case 'concert':
    case 'festival': return 'performance';
    default: return 'generic';
  }
}

export type FieldDef = {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

/** Declarative field schemas per archetype group. Rendered dynamically in ClientStrip. */
export const CLIENT_FIELD_SCHEMAS: Record<ClientDetails['archetype'], FieldDef[]> = {
  wedding: [
    { key: 'couple_name_a', label: 'Partner A', placeholder: 'First name' },
    { key: 'couple_name_b', label: 'Partner B', placeholder: 'First name' },
    { key: 'pronunciation', label: 'Pronunciation', placeholder: 'PREE-yah, not PRY-ah' },
    { key: 'bridal_party', label: 'Bridal party', placeholder: 'Maid of honor, best man...', multiline: true },
    { key: 'parents', label: 'Parents', placeholder: 'Names of parents to acknowledge', multiline: true },
    { key: 'officiant_name', label: 'Officiant', placeholder: 'Name of officiant' },
    { key: 'primary_contact_name', label: 'Day-of contact', placeholder: 'Wedding planner / coordinator' },
    { key: 'primary_contact_phone', label: 'Contact phone', placeholder: '+1...' },
    { key: 'special_requests', label: 'Special requests', placeholder: 'No Nickelback!', multiline: true },
  ],
  corporate: [
    { key: 'company_name', label: 'Company', placeholder: 'Acme Corp' },
    { key: 'event_contact_name', label: 'Event contact', placeholder: 'Name of your point person' },
    { key: 'event_contact_title', label: 'Contact title', placeholder: 'Event coordinator' },
    { key: 'primary_contact_phone', label: 'Contact phone', placeholder: '+1...' },
    { key: 'vip_names', label: 'VIPs', placeholder: 'CEO, keynote speaker...', multiline: true },
    { key: 'dress_code', label: 'Dress code', placeholder: 'Business casual, black tie...' },
    { key: 'pronunciation', label: 'Name pronunciations', placeholder: 'CEO last name: SHUH-mitz' },
    { key: 'special_requests', label: 'Special requests', multiline: true },
  ],
  social: [
    { key: 'honoree_name', label: 'Guest of honor', placeholder: 'Birthday person, honoree...' },
    { key: 'guest_of_honor_pronunciation', label: 'Pronunciation', placeholder: 'DAH-veed, not DAY-vid' },
    { key: 'primary_contact_name', label: 'Day-of contact', placeholder: 'Event host / planner' },
    { key: 'primary_contact_phone', label: 'Contact phone', placeholder: '+1...' },
    { key: 'vip_names', label: 'VIPs', placeholder: 'Key guests to acknowledge', multiline: true },
    { key: 'dress_code', label: 'Dress code', placeholder: 'Cocktail attire, casual...' },
    { key: 'special_requests', label: 'Special requests', multiline: true },
  ],
  performance: [
    { key: 'promoter_name', label: 'Promoter', placeholder: 'Promoter name / company' },
    { key: 'artist_liaison', label: 'Artist liaison', placeholder: 'Day-of contact for artists' },
    { key: 'headliner', label: 'Headliner', placeholder: 'Main act' },
    { key: 'primary_contact_phone', label: 'Liaison phone', placeholder: '+1...' },
    { key: 'set_restrictions', label: 'Set restrictions', placeholder: 'Curfew, volume limits, content restrictions...', multiline: true },
    { key: 'special_requests', label: 'Special requests', multiline: true },
  ],
  generic: [
    { key: 'primary_contact_name', label: 'Client name', placeholder: 'Primary contact' },
    { key: 'primary_contact_phone', label: 'Phone', placeholder: '+1...' },
    { key: 'primary_contact_email', label: 'Email', placeholder: 'client@example.com' },
    { key: 'pronunciation', label: 'Pronunciation', placeholder: 'How to say their name' },
    { key: 'special_requests', label: 'Special requests', multiline: true },
  ],
};

/** Create an empty client details object for a given archetype group. */
export function emptyClientDetails(archetype: string | null): ClientDetails {
  const group = archetypeToGroup(archetype);
  const base: ClientDetailsBase = {
    primary_contact_name: '',
    primary_contact_phone: '',
    primary_contact_email: '',
    pronunciation: '',
    special_requests: '',
    notes: '',
  };

  switch (group) {
    case 'wedding':
      return { ...base, archetype: 'wedding', couple_name_a: '', couple_name_b: '', bridal_party: '', parents: '', officiant_name: '' };
    case 'corporate':
      return { ...base, archetype: 'corporate', company_name: '', event_contact_name: '', event_contact_title: '', vip_names: '', dress_code: '' };
    case 'social':
      return { ...base, archetype: 'social', honoree_name: '', guest_of_honor_pronunciation: '', dress_code: '', vip_names: '' };
    case 'performance':
      return { ...base, archetype: 'performance', promoter_name: '', artist_liaison: '', headliner: '', set_restrictions: '' };
    default:
      return { ...base, archetype: 'generic' };
  }
}

/* ── Legacy V1 Types (for migration) ────────────────────────────── */

export type DjTimelineItem = {
  id: string;
  label: string;
  time: string;
  songs: string[];
};

export type LegacyDjPrepData = {
  dj_timeline: DjTimelineItem[];
  dj_must_play: string[];
  dj_play_if_possible: string[];
  dj_do_not_play: string[];
  dj_client_notes: string;
  dj_client_info: DjClientInfo;
  dj_spotify_link: string | null;
  dj_apple_music_link: string | null;
};

/* ── Save Result ────────────────────────────────────────────────── */

export type SaveDjPrepResult = { ok: true } | { ok: false; error: string };

/* ── Helpers ───────────────────────────────────────────────────── */

/**
 * Normalize a raw SongEntry read from JSONB.
 *
 * Legacy entries written before the 2026-04-10 Songs slice lack `added_by`
 * — coerce to `'dj'`. Also guards against `undefined` slipping through the
 * `as SongEntry[]` casts at the three reader boundaries
 * (schedule/page.tsx, [assignmentId]/page.tsx, bridge/programs/route.ts).
 *
 * Use this at every boundary where JSONB crosses into typed code. Never
 * inside the client portal projection path — that uses `toClientSongRequest`
 * in `src/features/client-portal/lib/client-songs.ts` instead (A2 / §6).
 */
export function normalizeSongEntry(raw: unknown): SongEntry {
  const r = (raw ?? {}) as Partial<SongEntry> & Record<string, unknown>;
  return {
    id: typeof r.id === 'string' ? r.id : '',
    title: typeof r.title === 'string' ? r.title : '',
    artist: typeof r.artist === 'string' ? r.artist : '',
    tier: (r.tier as SongTier) ?? 'must_play',
    assigned_moment_id: (r.assigned_moment_id as string | null) ?? null,
    sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    notes: typeof r.notes === 'string' ? r.notes : '',
    added_by: (r.added_by as SongAddedBy) ?? 'dj',
    requested_by_label: (r.requested_by_label as string | null | undefined) ?? null,
    requested_at: (r.requested_at as string | null | undefined) ?? null,
    is_late_add: (r.is_late_add as boolean | undefined) ?? false,
    acknowledged_at: (r.acknowledged_at as string | null | undefined) ?? null,
    acknowledged_moment_label: (r.acknowledged_moment_label as SpecialMomentLabel | null | undefined) ?? null,
    special_moment_label: (r.special_moment_label as SpecialMomentLabel | null | undefined) ?? null,
    spotify_id: (r.spotify_id as string | null | undefined) ?? null,
    apple_music_id: (r.apple_music_id as string | null | undefined) ?? null,
    isrc: (r.isrc as string | null | undefined) ?? null,
    artwork_url: (r.artwork_url as string | null | undefined) ?? null,
    duration_ms: (r.duration_ms as number | null | undefined) ?? null,
    preview_url: (r.preview_url as string | null | undefined) ?? null,
  };
}

/** Normalize a whole song pool array read from JSONB. Null/undefined → []. */
export function normalizeSongPool(raw: unknown): SongEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeSongEntry);
}

/** Flatten all timelines' moments into a single ordered array. */
export function flattenTimelines(timelines: ProgramTimeline[]): ProgramMoment[] {
  return timelines
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((tl, tlIdx) =>
      tl.moments.map((m, mIdx) => ({
        ...m,
        sort_order: tlIdx * 1000 + mIdx,
      }))
    );
}

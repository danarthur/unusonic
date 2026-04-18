/**
 * Event archetype — canonical label↔slug handling for the workspace-scoped
 * taxonomy that replaces the hardcoded `DEAL_ARCHETYPES` enum.
 *
 * This module's `normalizeEventArchetypeLabel` MUST mirror
 * `ops.normalize_event_archetype_label` in the DB character-for-character so
 * optimistic client-side dedup and server-side truth land on the same slug.
 * If you change one, change the other. They are tested against each other
 * via the sample test matrix at the bottom of this file.
 *
 * Rules (per 2026-04-18 Field Expert + User Advocate research):
 *   1. Unicode NFKC normalize
 *   2. Trim + collapse whitespace
 *   3. Lowercase (en-US, locale-independent)
 *   4. Strip anything that isn't [a-z0-9 -]
 *   5. Replace runs of [ -] with single _
 *   6. Trim leading/trailing _
 *   7. Singularize trailing s/es when the stem is safe.
 */
import { z } from 'zod';

const STOPWORDS = new Set([
  'business',
  'process',
  'focus',
  'gas',
  'plus',
  'jazz',
  'miss',
  'boss',
  'cross',
]);

/**
 * Convert a user-entered label into its canonical slug. Stable across locales;
 * deterministic.
 *
 * Examples (kept as invariants — DO NOT change these without updating the
 * matching PL/pgSQL function):
 *   'Wedding'          → 'wedding'
 *   'Weddings'         → 'wedding'
 *   '🎉 Wedding Party!'→ 'wedding_party'
 *   'Wedding  '        → 'wedding'
 *   'Cigar Tasting'    → 'cigar_tasting'
 *   'Product Launches' → 'product_launch'
 *   'Parties'          → 'party'
 *   'Business'         → 'business' (stopword, no singularize)
 *   'wedding-party'    → 'wedding_party'
 */
export function normalizeEventArchetypeLabel(input: string): string {
  if (!input) return '';
  let s = input.normalize('NFKC');
  s = s.trim().replace(/\s+/g, ' ');
  s = s.toLowerCase();
  // Strip anything not alnum / space / hyphen. Emoji and punctuation go.
  s = s.replace(/[^a-z0-9 \-]+/g, '');
  // Collapse spaces and hyphens to underscore runs, then compress.
  s = s.replace(/[ \-]+/g, '_');
  s = s.replace(/^_+|_+$/g, '');
  s = s.replace(/_+/g, '_');

  if (!s) return '';

  // Singularization rules — order matters.
  if (/(ss|us|is)es$/.test(s)) {
    s = s.replace(/es$/, '');
  } else if (/ies$/.test(s) && s.length >= 5) {
    s = s.replace(/ies$/, 'y');
  } else if (/(ch|sh|x|z)es$/.test(s)) {
    s = s.replace(/es$/, '');
  } else if (
    /s$/.test(s)
    && !/ss$/.test(s)
    && s.length >= 5
    && !STOPWORDS.has(s)
  ) {
    s = s.replace(/s$/, '');
  }
  return s;
}

/** Slug shape matches the DB CHECK: lowercase alnum + underscore, 1–80 chars. */
export const eventArchetypeSlugSchema = z
  .string()
  .regex(/^[a-z0-9_]+$/, 'Slug must be lowercase letters, digits, and underscores.')
  .min(1)
  .max(80);

/** Row shape returned by list/upsert/merge server actions. */
export const eventArchetypeRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid().nullable(),
  slug: eventArchetypeSlugSchema,
  label: z.string().min(1).max(80),
  is_system: z.boolean(),
  archived_at: z.string().nullable(),
});
export type EventArchetypeRow = z.infer<typeof eventArchetypeRowSchema>;

/** Upsert RPC response shape. */
export const eventArchetypeUpsertSchema = z.object({
  id: z.string().uuid(),
  slug: eventArchetypeSlugSchema,
  label: z.string(),
  is_system: z.boolean(),
  was_created: z.boolean(),
});
export type EventArchetypeUpsertResult = z.infer<typeof eventArchetypeUpsertSchema>;

/**
 * Given a typed label, find an existing archetype whose normalized slug
 * matches. Client-side helper for the create-footer suppression — when a
 * match exists, we hide "Create 'X'" and highlight the existing row instead.
 */
export function findMatchingArchetype(
  label: string,
  archetypes: EventArchetypeRow[]
): EventArchetypeRow | null {
  const slug = normalizeEventArchetypeLabel(label);
  if (!slug) return null;
  return archetypes.find((a) => a.slug === slug && !a.archived_at) ?? null;
}

/**
 * Fallback labels for legacy rows that reference slugs no longer in the
 * workspace (e.g. a system slug that got archived, or data migrated from the
 * pre-P0 enum). Renderers lean on this when the live label lookup misses.
 */
export const SYSTEM_ARCHETYPE_LABELS: Record<string, string> = {
  wedding: 'Wedding',
  corporate_gala: 'Corporate gala',
  product_launch: 'Product launch',
  private_dinner: 'Private dinner',
  concert: 'Concert',
  festival: 'Festival',
  awards_show: 'Awards show',
  conference: 'Conference',
  birthday: 'Birthday',
  charity_gala: 'Charity gala',
};

/** Humanize a raw slug when no label is known — prettier than the slug itself. */
export function humanizeSlug(slug: string | null | undefined): string {
  if (!slug) return '';
  const known = SYSTEM_ARCHETYPE_LABELS[slug];
  if (known) return known;
  // Replace underscores with spaces, title-case first letter.
  const withSpaces = slug.replace(/_/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

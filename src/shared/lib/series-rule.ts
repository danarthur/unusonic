/**
 * Series rule — the canonical shape stored on `ops.projects.series_rule`.
 *
 * `rdates` is the SOURCE OF TRUTH for dates the series spans. `rrule` is a
 * human-readable label describing the pattern that produced `rdates` (for UI
 * breadcrumbs like "Every Saturday"); it is NOT re-expanded at read time and
 * must not drift from the list. `exdates` are removed from the rendered set.
 *
 * The PL/pgSQL helper `_expand_series_rule(series_rule jsonb) returns setof date`
 * reads `rdates - exdates` only. An RRULE is expanded in JS (via the `rrule`
 * package) at creation time and the resulting dates are persisted. Never
 * expanded in the database.
 *
 * `primary_date` is the first show — used for pipeline sort, `public.deals.proposed_date`
 * denormalization, and any single-date surface that needs one representative.
 */
import { z } from 'zod';

const yyyyMmDd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd');

export const SeriesRuleSchema = z.object({
  /** Human-readable RFC 5545 RRULE label. Display-only; does NOT drive expansion. */
  rrule: z.string().nullable(),
  /** Materialized dates the series covers (yyyy-MM-dd). Source of truth. */
  rdates: z.array(yyyyMmDd),
  /** Dates removed from the rendered set (yyyy-MM-dd). */
  exdates: z.array(yyyyMmDd),
  /** IANA tz used to expand the RRULE; also used for event timestamps. */
  tz: z.string().min(1),
  /** First show (yyyy-MM-dd). Used for pipeline sort + legacy proposed_date. */
  primary_date: yyyyMmDd,
});

export type SeriesRule = z.infer<typeof SeriesRuleSchema>;

/** Supported archetypes for series naming + Aion routing. `null` for singletons. */
export const SERIES_ARCHETYPES = ['residency', 'tour', 'run', 'weekend', 'custom'] as const;
export type SeriesArchetype = (typeof SERIES_ARCHETYPES)[number];

/**
 * Return the effective sorted date list for a series (rdates minus exdates,
 * deduped and chronological). Matches the database `_expand_series_rule` helper.
 */
export function expandSeriesRule(rule: SeriesRule): string[] {
  const ex = new Set(rule.exdates);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of rule.rdates) {
    if (ex.has(d) || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  out.sort();
  return out;
}

/** Convenience: count of active dates in the series. */
export function seriesDateCount(rule: SeriesRule): number {
  return expandSeriesRule(rule).length;
}

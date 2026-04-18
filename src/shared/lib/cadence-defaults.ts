/**
 * Cold-start cadence defaults — used when the owner-cadence gate returns
 * `sampleQuality: 'insufficient'`. These are hand-picked priors, not learned.
 * Product can tune without DB changes.
 *
 * See docs/reference/aion-deal-card-unified-design.md §20.10.
 *
 * The "archetype" here is an event archetype slug — workspaces create their
 * own (public.workspace_event_archetypes). `wedding`, `corporate`, `tour` are
 * the common defaults; anything else falls to `other`.
 */

export type CadenceArchetype = 'wedding' | 'corporate' | 'tour' | 'other';

/** Typical days between proposal-sent and the first owner-initiated follow-up. */
export const DEFAULT_DAYS_PROPOSAL_TO_FIRST_FOLLOWUP: Record<CadenceArchetype, number> = {
  wedding: 5,
  corporate: 2,
  tour: 7,
  other: 4,
};

/**
 * Normalize a raw archetype slug into one of our four buckets. Anything that
 * doesn't match wedding/corporate/tour is bucketed as 'other' — including
 * NULL, empty strings, and workspace-custom archetypes.
 */
export function normalizeCadenceArchetype(raw: string | null | undefined): CadenceArchetype {
  if (!raw) return 'other';
  const slug = raw.toLowerCase().trim();
  if (slug === 'wedding' || slug === 'corporate' || slug === 'tour') return slug;
  return 'other';
}

/** Look up the cold-start default for an archetype, with normalization. */
export function defaultDaysToFirstFollowup(archetype: string | null | undefined): number {
  return DEFAULT_DAYS_PROPOSAL_TO_FIRST_FOLLOWUP[normalizeCadenceArchetype(archetype)];
}

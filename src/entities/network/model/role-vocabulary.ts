/**
 * Seeded role vocabulary for roster members.
 *
 * Roles are a controlled, multi-value tag set -- never free text. Free-text job
 * titles fragment into "DJ" / "dj" / "DJ/MC" / "Disc Jockey" within weeks, and
 * grouping over that produces four groups for one role. That fragmentation, not
 * the number of groups, is what actually makes a contacts page feel unorganised.
 *
 * Multi-value is required, not optional: in live events dual-role is the norm
 * rather than the edge case -- the DJ who also MCs, the tech who also drives the
 * truck. A single-value field forces a false choice, and the person then goes
 * missing from the role search they should have matched.
 *
 * Seeds are pack-aware because an agency and a production company genuinely
 * organise different work. A seeded list is also what makes this cheap to adopt:
 * nobody organises a list they had to invent from scratch.
 */

import type { LabelPack } from './label-packs';

export type RoleSeed = { slug: string; label: string };

const AGENCY: RoleSeed[] = [
  { slug: 'dj', label: 'DJ' },
  { slug: 'mc', label: 'MC' },
  { slug: 'photographer', label: 'Photographer' },
  { slug: 'videographer', label: 'Videographer' },
  { slug: 'photo_booth', label: 'Photo booth' },
  { slug: 'dancer', label: 'Dancer' },
  { slug: 'musician', label: 'Musician' },
  { slug: 'staff', label: 'Staff' },
];

const PRODUCTION: RoleSeed[] = [
  { slug: 'audio', label: 'Audio' },
  { slug: 'lighting', label: 'Lighting' },
  { slug: 'video', label: 'Video' },
  { slug: 'rigging', label: 'Rigging' },
  { slug: 'stagehand', label: 'Stagehand' },
  { slug: 'driver', label: 'Driver' },
  { slug: 'project_manager', label: 'Project manager' },
  { slug: 'staff', label: 'Staff' },
];

/**
 * Neutral default. Deliberately shorter than either specialised set -- a
 * workspace that has not told us what it does is better served by a few obvious
 * roles it will actually use than by a long list it has to prune.
 */
const NEUTRAL: RoleSeed[] = [
  { slug: 'lead', label: 'Lead' },
  { slug: 'technician', label: 'Technician' },
  { slug: 'assistant', label: 'Assistant' },
  { slug: 'driver', label: 'Driver' },
  { slug: 'staff', label: 'Staff' },
];

export const ROLE_SEEDS: Record<LabelPack, RoleSeed[]> = {
  talent: AGENCY,
  crew: PRODUCTION,
  roster: NEUTRAL,
};

/** The seed set for a workspace's vocabulary, used once at setup. */
export function roleSeedsFor(pack: LabelPack): RoleSeed[] {
  return ROLE_SEEDS[pack] ?? NEUTRAL;
}

/**
 * Normalise a typed role name to a slug. Mirrors the archetype normaliser's
 * intent: case-insensitive de-duplication on entry is what stops "DJ" and "dj"
 * becoming two roles.
 */
export function normalizeRoleLabel(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 \-/]+/g, '')
    .replace(/[ \-/]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

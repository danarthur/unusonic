/**
 * Derive suggested persona and tier from scout result (onboarding).
 * Pure helper – no Server Action.
 * @module features/onboarding/lib/suggest-persona-tier
 */

import type { ScoutResult } from '@/features/intelligence';
import type { UserPersona } from '../model/subscription-types';
import type { GenesisTierId } from '@/features/org-identity';

const VENUE_TAGS = ['venue', 'pms', 'beo', 'catering', 'hospitality', 'hotel', 'conference'];
const AGENCY_TAGS = ['agency', 'production', 'team', 'crew', 'full-service'];

export function suggestPersonaAndTierFromScout(data: ScoutResult): {
  suggestedPersona: UserPersona;
  suggestedTier: GenesisTierId;
} {
  const tags = (data.tags ?? []).map((t) => t.toLowerCase());
  const isVenue = VENUE_TAGS.some((v) => tags.some((t) => t.includes(v)));
  const rosterCount = data.roster?.length ?? 0;
  const isAgency =
    rosterCount >= 3 ||
    AGENCY_TAGS.some((v) => tags.some((t) => t.includes(v)));

  let suggestedPersona: UserPersona = 'solo_professional';
  if (isVenue) suggestedPersona = 'venue_brand';
  else if (isAgency) suggestedPersona = 'agency_team';

  let suggestedTier: GenesisTierId = 'scout';
  if (suggestedPersona === 'venue_brand') suggestedTier = 'command';
  else if (suggestedPersona === 'agency_team') suggestedTier = 'vanguard';

  return { suggestedPersona, suggestedTier };
}

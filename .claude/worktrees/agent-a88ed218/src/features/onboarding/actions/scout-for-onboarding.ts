/**
 * Onboarding: scout company website (no org required).
 * Uses scoutEntityForOnboarding and returns suggested persona/tier from result.
 * @module features/onboarding/actions/scout-for-onboarding
 */

'use server';

import 'server-only';
import { scoutEntityForOnboarding } from '@/features/intelligence';
import type { ScoutResult } from '@/features/intelligence';
import type { UserPersona } from '../model/subscription-types';
import type { GenesisTierId } from '@/features/org-identity';
import { suggestPersonaAndTierFromScout } from '../lib/suggest-persona-tier';

export interface ScoutForOnboardingResult {
  success: boolean;
  error?: string;
  data?: ScoutResult;
  suggestedPersona?: UserPersona;
  suggestedTier?: GenesisTierId;
}

export async function scoutCompanyForOnboarding(
  url: string
): Promise<ScoutForOnboardingResult> {
  const trimmed = url?.trim();
  if (!trimmed || trimmed.length < 4) {
    return { success: false, error: 'Enter a valid website URL.' };
  }

  const result = await scoutEntityForOnboarding(trimmed);

  if ('error' in result) {
    return { success: false, error: result.error };
  }

  const { suggestedPersona, suggestedTier } = suggestPersonaAndTierFromScout(result.data);
  return {
    success: true,
    data: result.data,
    suggestedPersona,
    suggestedTier,
  };
}

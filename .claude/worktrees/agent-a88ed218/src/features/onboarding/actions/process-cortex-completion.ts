/**
 * Hybrid Extraction Onboarding – Bouncer (Deterministic Core)
 * Validates AI output and completes onboarding via existing initializeOrganization.
 * @module features/onboarding/actions/process-cortex-completion
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { cortexExtractionSchema } from '../model/schema';
import type { CortexExtraction } from '../model/schema';
import { initializeOrganization } from './complete-setup';

export interface ProcessCortexCompletionResult {
  success: boolean;
  error?: string;
}

/**
 * Bouncer: validate Cortex JSON, update profile (fullName, onboarding_summary), then run existing init.
 * Does not replicate writes – calls initializeOrganization so workspace/org/agent_config stay in sync.
 */
export async function processCortexCompletion(
  raw: unknown
): Promise<ProcessCortexCompletionResult> {
  const parsed = cortexExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { success: false, error: first?.message ?? 'Invalid extraction' };
  }

  const data: CortexExtraction = parsed.data;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: 'Not authenticated' };
  }

  // 1) Update profile with fullName and onboarding_summary (additive; initializeOrganization will set onboarding_completed, step, persona)
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      full_name: data.fullName.trim(),
      onboarding_summary: data.onboarding_summary?.trim() ?? null,
    })
    .eq('id', user.id);

  if (profileError) {
    return { success: false, error: profileError.message ?? 'Failed to update profile' };
  }

  // 2) Reuse existing init – workspace, org, agent_config, onboarding_completed, persona
  const result = await initializeOrganization({
    name: data.organizationName.trim(),
    type: data.organizationType,
    subscriptionTier: data.subscriptionTier,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

export interface InitialOnboardingContext {
  fullName: string;
  email: string;
}

/**
 * Pre-fill helper: fetches fullName and email from session/profile for Cortex UI.
 * Ensures the AI does not re-ask for identity when user came from passkey/signup.
 */
export async function getInitialOnboardingContext(): Promise<InitialOnboardingContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  let fullName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? '';
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.full_name) {
    fullName = profile.full_name;
  }

  return {
    fullName: fullName || '',
    email: user.email ?? '',
  };
}

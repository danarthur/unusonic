/**
 * Signal Onboarding – Persona & Subscription Actions
 * Progressive Disclosure: persona → tier → SignalPay
 * @module features/onboarding/api/subscription-actions
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { selectPersonaSchema, selectTierSchema } from '../model/schema';
import type { UserPersona, SubscriptionTier } from '../model/subscription-types';

export interface PersonaResult {
  success: boolean;
  error?: string;
}

export interface TierResult {
  success: boolean;
  error?: string;
}

/**
 * Step 1 (Progressive Disclosure): Save user persona.
 * Drives default tier suggestion and agent config.
 */
export async function savePersona(
  _prev: unknown,
  formData: FormData
): Promise<PersonaResult> {
  const raw = { persona: formData.get('persona') };
  const parsed = selectPersonaSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid persona' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Check if profiles table exists and has persona column
  const { error } = await supabase
    .from('profiles')
    .update({
      persona: parsed.data.persona,
      onboarding_persona_completed: true,
    })
    .eq('id', user.id);

  if (error) {
    // Graceful: profiles may not have persona column yet
    console.warn('[Onboarding] savePersona:', error.message);
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  return { success: true };
}

/**
 * Step 2: Set workspace subscription tier and create agent_config.
 * Called after workspace is created/joined.
 */
export async function saveTier(
  workspaceId: string,
  formData: FormData
): Promise<TierResult> {
  const raw = {
    tier: formData.get('tier'),
    enableSignalPay: formData.get('enableSignalPay') === 'true',
  };
  const parsed = selectTierSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid tier' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  // Verify workspace membership
  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .single();

  if (!member) return { success: false, error: 'Not a member of this workspace' };

  const tier = parsed.data.tier as SubscriptionTier;

  // Update workspace
  const { error: wsError } = await supabase
    .from('workspaces')
    .update({
      subscription_tier: tier,
      signalpay_enabled: tier === 'autonomous' ? true : (parsed.data.enableSignalPay ?? false),
    })
    .eq('id', workspaceId);

  if (wsError) return { success: false, error: wsError.message };

  // Get persona from profile (or default)
  const { data: profile } = await supabase
    .from('profiles')
    .select('persona')
    .eq('id', user.id)
    .maybeSingle();

  const persona = (profile?.persona ?? 'solo_professional') as UserPersona;

  // Upsert agent_config
  const { error: configError } = await supabase
    .from('agent_configs')
    .upsert(
      {
        workspace_id: workspaceId,
        persona,
        tier,
        xai_reasoning_enabled: true,
        agent_mode: tier === 'autonomous' ? 'autonomous' : 'assist',
        modules_enabled: ['crm', 'calendar'],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' }
    );

  if (configError) {
    // Non-fatal: workspace tier is set, agent_config may not exist yet
    console.warn('[Onboarding] saveTier agent_config:', configError.message);
  }

  revalidatePath('/');
  return { success: true };
}

/**
 * Mark SignalPay prompt as shown (for Autonomous tier eligibility).
 */
export async function markSignalPayPrompted(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_signalpay_prompted: true })
    .eq('id', user.id);

  if (error) return { success: false, error: error.message };
  revalidatePath('/');
  return { success: true };
}

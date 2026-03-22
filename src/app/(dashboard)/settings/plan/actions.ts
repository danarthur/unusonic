'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SubscriptionTier } from '@/features/onboarding/model/subscription-types';

export async function updateWorkspacePlan(
  tier: SubscriptionTier
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!membership) return { ok: false, error: 'No workspace found' };
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return { ok: false, error: 'Only workspace owners can change the plan' };
  }

  const { error } = await supabase
    .from('workspaces')
    .update({ subscription_tier: tier })
    .eq('id', membership.workspace_id);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings/plan');
  revalidatePath('/settings');
  return { ok: true };
}

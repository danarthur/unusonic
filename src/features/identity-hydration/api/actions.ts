 
/**
 * Identity Hydration - Server Actions
 * Profile and onboarding management
 * @module features/identity-hydration/api/actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Profile } from '../model/types';
import type { TablesInsert } from '@/types/supabase';

// ============================================================================
// Profile Actions
// ============================================================================

/**
 * Updates or creates the current user's profile (upsert)
 * Ensures typing in onboarding creates a profile even when no row exists yet
 */
export async function updateProfile(data: {
  fullName?: string;
  avatarUrl?: string | null;
}): Promise<{ success: boolean; error?: string; profile?: Profile }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  /*
    `preferences` used to be accepted here and written to a `profiles.preferences`
    column that does not exist -- any caller passing it would have got a 400 for
    the whole upsert, taking the name and avatar down with it. No caller ever
    did. Typing the payload as the table's own Insert shape is what makes that
    visible.
  */
  const upsertData: TablesInsert<'profiles'> = {
    id: user.id,
  };
  if (data.fullName !== undefined) upsertData.full_name = data.fullName;
  if (data.avatarUrl !== undefined) upsertData.avatar_url = data.avatarUrl;

  const { data: profile, error } = await supabase
    .from('profiles')
    .upsert(upsertData, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('[Identity] Update profile error:', error);
    return { success: false, error: error.message };
  }

  revalidatePath('/');
  return { success: true };
}

/**
 * Updates onboarding progress
 */
export async function updateOnboardingStep(step: number): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_step: step })
    .eq('id', user.id);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

/**
 * Completes the onboarding process
 */
export async function completeOnboarding(): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  const { error } = await supabase
    .from('profiles')
    .update({ 
      onboarding_completed: true,
      onboarding_step: 3,
    })
    .eq('id', user.id);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  revalidatePath('/');
  return { success: true };
}

// ============================================================================
// Workspace Actions
// ============================================================================

/*
  joinWorkspace lived here and is gone.

  It looked a workspace up by `workspaces.invite_code` and checked membership by
  `workspace_members.id`. Neither column exists, so both queries answered 400
  and the function could only ever return 'Invalid invite code'. It was exported
  from the feature barrel and called by nothing.

  Joining a workspace goes through `public.invitations` and
  `acceptEmployeeInvite`. The two SECURITY DEFINER functions from the invite-code
  design -- `regenerate_invite_code` and `workspace_joinable_by_invite` -- are
  still in the database and reference the same absent columns; they raise if
  called, and nothing calls them.
*/

export async function uploadAvatar(formData: FormData): Promise<{
  success: boolean;
  error?: string;
  avatarUrl?: string;
}> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  const file = formData.get('avatar') as File;
  if (!file || file.size === 0) {
    return { success: false, error: 'No file provided' };
  }
  
  // Validate file type
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'File must be an image' };
  }
  
  // Validate file size (max 2MB)
  if (file.size > 2 * 1024 * 1024) {
    return { success: false, error: 'File must be less than 2MB' };
  }
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${user.id}-${Date.now()}.${fileExt}`;
  const filePath = `avatars/${fileName}`;
  
  // Upload to storage
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
    });
  
  if (uploadError) {
    console.error('[Identity] Avatar upload error:', uploadError);
    return { success: false, error: 'Failed to upload avatar' };
  }
  
  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(filePath);
  
  // Update profile
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);
  
  if (updateError) {
    return { success: false, error: 'Failed to update profile' };
  }
  
  revalidatePath('/');
  return { success: true, avatarUrl: publicUrl };
}

// ============================================================================
// Ghost Entity Claiming
// ============================================================================

/**
 * Claims ghost entities matching the authenticated user's email that have
 * CLIENT relationship edges. Creates workspace memberships with client role.
 * Called during onboarding — fire-and-forget, errors are non-blocking.
 *
 * Returns the number of entities claimed (0 if none found or on error).
 */
export async function claimGhostEntities(): Promise<number> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('claim_ghost_entities_for_user');
    if (error) {
      console.error('[claimGhostEntities] RPC error:', error.message);
      return 0;
    }
    return data ?? 0;
  } catch (err) {
    console.error('[claimGhostEntities] Unexpected error:', err);
    return 0;
  }
}

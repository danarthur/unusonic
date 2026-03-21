/**
 * Identity Hydration - Server Actions
 * Profile and onboarding management
 * @module features/identity-hydration/api/actions
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Profile, WorkspaceMembership } from '../model/types';

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
  preferences?: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string; profile?: Profile }> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }

  const upsertData: Record<string, unknown> = {
    id: user.id,
  };
  if (data.fullName !== undefined) upsertData.full_name = data.fullName;
  if (data.avatarUrl !== undefined) upsertData.avatar_url = data.avatarUrl;
  if (data.preferences !== undefined) upsertData.preferences = data.preferences;

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

/**
 * Creates a new workspace and adds the user as owner
 */
export async function createWorkspace(data: {
  name: string;
}): Promise<{ success: boolean; error?: string; workspace?: { id: string; name: string } }> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  // Create workspace
  const { data: workspace, error: createError } = await supabase
    .from('workspaces')
    .insert({
      name: data.name,
      created_by: user.id,
    })
    .select()
    .single();
  
  if (createError) {
    console.error('[Identity] Create workspace error:', createError);
    return { success: false, error: createError.message };
  }
  
  // Add user as owner
  const { error: memberError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });
  
  if (memberError) {
    console.error('[Identity] Add member error:', memberError);
    // Rollback workspace creation
    await supabase.from('workspaces').delete().eq('id', workspace.id);
    return { success: false, error: memberError.message };
  }
  
  revalidatePath('/');
  return { 
    success: true, 
    workspace: { id: workspace.id, name: workspace.name },
  };
}

/**
 * Joins a workspace using an invite code
 */
export async function joinWorkspace(inviteCode: string): Promise<{ 
  success: boolean; 
  error?: string; 
  workspace?: { id: string; name: string };
}> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Not authenticated' };
  }
  
  // Find workspace by invite code
  const { data: workspace, error: findError } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('invite_code', inviteCode)
    .single();
  
  if (findError || !workspace) {
    return { success: false, error: 'Invalid invite code' };
  }
  
  // Check if already a member
  const { data: existingMember } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspace.id)
    .eq('user_id', user.id)
    .single();
  
  if (existingMember) {
    return { success: false, error: 'Already a member of this workspace' };
  }
  
  // Add user as member
  const { error: joinError } = await supabase
    .from('workspace_members')
    .insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'member',
    });
  
  if (joinError) {
    return { success: false, error: joinError.message };
  }
  
  revalidatePath('/');
  return { success: true, workspace };
}

// ============================================================================
// Avatar Upload
// ============================================================================

/**
 * Uploads an avatar image and updates the profile
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

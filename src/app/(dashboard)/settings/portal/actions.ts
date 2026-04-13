'use server';

import { createClient } from '@/shared/api/supabase/server';
import type { PortalThemePreset, PortalThemeConfig } from '@/shared/lib/portal-theme';

const VALID_PRESETS = new Set<string>([
  // Current preset slugs
  'paper', 'clean', 'blackout', 'editorial', 'civic',
  'linen', 'poster', 'terminal', 'marquee', 'broadcast', 'gallery', 'custom',
  // Legacy aliases — accepted on save so migrating workspaces don't break
  'default', 'minimalist', 'dark-stage', 'neo-brutalist', 'tactile-warm', 'retro-future',
]);

export async function getPortalTheme(): Promise<{
  preset: PortalThemePreset;
  config: PortalThemeConfig;
} | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('portal_theme_preset, portal_theme_config')
    .eq('id', membership.workspace_id)
    .single();

  if (!workspace) return null;

  return {
    preset: (workspace.portal_theme_preset ?? 'paper') as PortalThemePreset,
    config: (workspace.portal_theme_config ?? {}) as PortalThemeConfig,
  };
}

export async function updatePortalTheme(
  preset: string,
  config: PortalThemeConfig
): Promise<{ success: boolean; error?: string }> {
  if (!VALID_PRESETS.has(preset)) {
    return { success: false, error: 'Invalid theme preset.' };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated.' };

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return { success: false, error: 'No workspace found.' };

  // Only owners and admins can change the portal theme
  if (membership.role !== 'owner' && membership.role !== 'admin') {
    return { success: false, error: 'Only workspace owners and admins can change the portal theme.' };
  }

  const { error } = await supabase
    .from('workspaces')
    .update({
      portal_theme_preset: preset,
      portal_theme_config: config,
    })
    .eq('id', membership.workspace_id);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

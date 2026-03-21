/**
 * User Context Loader - Server Only
 * Loads and hydrates the complete user context
 * @module features/identity-hydration/api/user-loader
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import type { 
  HydratedUserContext, 
  Profile, 
  WorkspaceMembership, 
  IntegrationStatus,
  UserPreferences,
} from '../model/types';

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'japandi',
  motion: 'full',
  notifications: { email: true, push: false },
  locale: 'en-US',
};

const EMPTY_CONTEXT: HydratedUserContext = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  profile: null,
  workspaces: [],
  currentWorkspaceId: null,
  integrations: {
    quickbooks: { connected: false, companyName: null, lastSyncAt: null },
  },
};

/**
 * Loads the complete user context for the authenticated user
 * Used for session hydration on app load
 */
export async function loadUserContext(): Promise<HydratedUserContext> {
  const supabase = await createClient();
  
  // 1. Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return EMPTY_CONTEXT;
  }
  
  // 2. Fetch profile
  let profile: Profile | null = null;
  try {
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    
    if (profileData && !profileError) {
      profile = transformProfile(profileData);
    }
  } catch (e) {
    console.error('[UserLoader] Profile fetch error:', e);
  }
  
  // 3. Fetch workspace memberships
  const workspaces: WorkspaceMembership[] = [];
  try {
    const { data: memberships, error: membershipError } = await supabase
      .from('workspace_members')
      .select(`
        workspace_id,
        role,
        created_at,
        workspaces:workspace_id (
          id,
          name
        )
      `)
      .eq('user_id', user.id);
    
    if (memberships && !membershipError) {
      for (const m of memberships) {
        const rawWs = m.workspaces;
        const ws = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string } | null;
        workspaces.push({
          workspaceId: m.workspace_id,
          workspaceName: ws?.name ?? null,
          role: m.role,
          joinedAt: new Date(m.created_at),
        });
      }
    }
  } catch (e) {
    console.error('[UserLoader] Workspace fetch error:', e);
  }
  
  // 4. Fetch integration status (QuickBooks)
  const integrations: IntegrationStatus = {
    quickbooks: { connected: false, companyName: null, lastSyncAt: null },
  };
  
  // Only check if user has workspaces
  if (workspaces.length > 0) {
    try {
      const { data: qbConnection } = await supabase
        .schema('finance')
        .from('quickbooks_connections')
        .select('company_name, is_connected, last_sync_at')
        .eq('workspace_id', workspaces[0].workspaceId)
        .single();
      
      if (qbConnection) {
        integrations.quickbooks = {
          connected: qbConnection.is_connected,
          companyName: qbConnection.company_name,
          lastSyncAt: qbConnection.last_sync_at ? new Date(qbConnection.last_sync_at) : null,
        };
      }
    } catch (e) {
      // QuickBooks connection table might not exist yet - that's ok
      console.debug('[UserLoader] QuickBooks fetch skipped:', e);
    }
  }
  
  // 5. Determine current workspace
  let currentWorkspaceId: string | null = null;
  if (workspaces.length > 0) {
    // Prefer owner/admin workspace, fallback to first
    const primaryWorkspace = workspaces.find(w => w.role === 'owner' || w.role === 'admin');
    currentWorkspaceId = primaryWorkspace?.workspaceId ?? workspaces[0].workspaceId;
  }
  
  return {
    isAuthenticated: true,
    isLoading: false,
    user: {
      id: user.id,
      email: user.email || '',
    },
    profile,
    workspaces,
    currentWorkspaceId,
    integrations,
  };
}

/**
 * Checks if user needs onboarding
 */
export async function checkOnboardingStatus(): Promise<{
  needsOnboarding: boolean;
  currentStep: number;
}> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { needsOnboarding: false, currentStep: 0 };
  }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completed, onboarding_step')
    .eq('id', user.id)
    .single();
  
  return {
    needsOnboarding: !profile?.onboarding_completed,
    currentStep: profile?.onboarding_step ?? 0,
  };
}

// ============================================================================
// Transform Helpers
// ============================================================================

function transformProfile(data: Record<string, unknown>): Profile {
  const rawPrefs = data.preferences as Record<string, unknown> | null;
  const preferences: UserPreferences = {
    theme: (rawPrefs?.theme as UserPreferences['theme']) || DEFAULT_PREFERENCES.theme,
    motion: (rawPrefs?.motion as UserPreferences['motion']) || DEFAULT_PREFERENCES.motion,
    notifications: (rawPrefs?.notifications as UserPreferences['notifications']) || DEFAULT_PREFERENCES.notifications,
    locale: (rawPrefs?.locale as string) || DEFAULT_PREFERENCES.locale,
  };
  
  return {
    id: data.id as string,
    email: data.email as string,
    fullName: data.full_name as string | null,
    avatarUrl: data.avatar_url as string | null,
    onboardingCompleted: data.onboarding_completed as boolean,
    onboardingStep: data.onboarding_step as number,
    preferences,
    createdAt: new Date(data.created_at as string),
    updatedAt: new Date(data.updated_at as string),
  };
}

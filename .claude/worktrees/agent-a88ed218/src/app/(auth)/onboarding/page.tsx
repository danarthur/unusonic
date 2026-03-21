/**
 * Onboarding Wizard Page
 * Streamlined 2-step setup flow for new users
 * @module app/(auth)/onboarding
 */

import { redirect } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { OnboardingWizard } from './components/onboarding-wizard';

export const metadata = {
  title: 'Setup | Signal',
  description: 'One-time setup for your workspace',
};

export const dynamic = 'force-dynamic';

async function getOnboardingState() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  // Fetch profile - resilient when table missing or RLS blocks (e.g. no row yet)
  let profile: { full_name?: string | null; avatar_url?: string | null; onboarding_completed?: boolean | null; onboarding_step?: number | null } | null = null;
  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, onboarding_completed, onboarding_step')
    .eq('id', user.id)
    .maybeSingle();
  
  if (!profileError) {
    profile = profileData;
  }
  // When profile fetch fails (table missing, RLS, or no row), treat as no profile and use auth metadata
  
  // If onboarding is already complete, redirect to dashboard
  if (profile?.onboarding_completed) {
    redirect('/lobby');
  }
  
  // Fetch existing workspaces
  let workspaces: { workspace_id: string; workspaces: { id: string; name: string } | null }[] = [];
  const { data: workspaceData, error: workspaceError } = await supabase
    .from('workspace_members')
    .select(`
      workspace_id,
      role,
      workspaces:workspace_id (id, name)
    `)
    .eq('user_id', user.id);
  
  if (!workspaceError && workspaceData) {
    workspaces = workspaceData as unknown as typeof workspaces;
  }
  
  // Full name: profile first, then auth user metadata
  const fullName = profile?.full_name 
    || user.user_metadata?.full_name 
    || user.user_metadata?.name 
    || '';
  
  return {
    user: {
      id: user.id,
      email: user.email || '',
    },
    profile: {
      fullName,
      avatarUrl: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
      onboardingStep: profile?.onboarding_step ?? 0,
    },
    hasWorkspace: workspaces.length > 0,
    workspaceId: workspaces[0]?.workspace_id ?? null,
    workspaceName: (workspaces[0]?.workspaces as { name?: string } | null)?.name ?? null,
  };
}

export default async function OnboardingPage() {
  const state = await getOnboardingState();
  
  return (
    <div className="min-h-screen w-full relative">
      {/* Match login: spotlight + grain — no colored orbs */}
      <div className="fixed inset-0 z-0 bg-signal-void pointer-events-none" aria-hidden>
        <div className="absolute inset-0 grain-overlay" aria-hidden />
      </div>
      <div className="relative z-10">
        <OnboardingWizard initialState={state} />
      </div>
    </div>
  );
}

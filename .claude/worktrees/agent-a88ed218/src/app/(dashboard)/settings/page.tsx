/**
 * Settings Page
 * Manage integrations, team, and account settings
 * @module app/(dashboard)/settings
 */

import { Suspense } from 'react';
import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { SettingsContent } from './components/settings-content';
import { getWorkspaceMembers, getWorkspaceLocations } from '@/app/actions/workspace';
import type { WorkspaceMemberData, LocationData, WorkspacePermissions } from '@/app/actions/workspace';

export const metadata = {
  title: 'Settings | Signal',
  description: 'Manage your Signal settings and integrations',
};

export const dynamic = 'force-dynamic';

async function getSettingsData() {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    redirect('/login');
  }
  
  // Get profile - use maybeSingle for safety
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  
  // Get workspace membership with permissions - user might not have a workspace yet.
  // Prefer role from workspace_roles.slug (role_id) when set so UI matches DB source of truth.
  const { data: workspaceMembership } = await supabase
    .from('workspace_members')
    .select(`
      workspace_id,
      role,
      role_id,
      department,
      permissions,
      workspaces:workspace_id (id, name, invite_code, subscription_tier),
      workspace_roles:role_id (slug)
    `)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  
  const rawWs = workspaceMembership?.workspaces;
  const workspace = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string; invite_code: string | null; subscription_tier?: string | null } | null;
  const rawRole = workspaceMembership?.workspace_roles;
  const roleSlug = (Array.isArray(rawRole) ? rawRole[0] : rawRole) as { slug: string } | null;
  const resolvedRole = (roleSlug?.slug ?? workspaceMembership?.role ?? 'member') as string;
  const workspaceRole = (resolvedRole === 'observer' ? 'viewer' : resolvedRole) as 'owner' | 'admin' | 'member' | 'viewer';

  // Check QuickBooks connection status (qbo_configs = source of truth for new flow)
  const workspaceId = workspaceMembership?.workspace_id;
  let quickbooksConnected = false;
  let qboRealmId: string | null = null;
  let members: WorkspaceMemberData[] = [];
  let locations: LocationData[] = [];
  
  if (workspaceId) {
    const { data: qboConfig } = await supabase
      .from('qbo_configs')
      .select('realm_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (qboConfig?.realm_id) {
      quickbooksConnected = true;
      qboRealmId = qboConfig.realm_id;
    }
    if (!quickbooksConnected) {
      const { data: financeData } = await supabase
        .from('finance')
        .select('quickbooks_connected')
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      quickbooksConnected = financeData?.quickbooks_connected || false;
    }
    
    // Fetch team members (if owner/admin or has manage_team permission)
    const canViewTeam =
      workspaceRole === 'owner' ||
      workspaceRole === 'admin' ||
      (workspaceMembership.permissions as WorkspacePermissions)?.manage_team;
    
    if (canViewTeam) {
      const membersResult = await getWorkspaceMembers(workspaceId);
      if (membersResult.success && membersResult.members) {
        members = membersResult.members;
      }
      
      const locationsResult = await getWorkspaceLocations(workspaceId);
      if (locationsResult.success && locationsResult.locations) {
        locations = locationsResult.locations;
      }
    }
  }

  return {
    user: {
      id: user.id,
      email: user.email || '',
    },
    profile: profile ? {
      fullName: profile.full_name || '',
      avatarUrl: profile.avatar_url || null,
    } : {
      fullName: '',
      avatarUrl: null,
    },
    workspace: workspaceMembership ? {
      id: workspaceMembership.workspace_id,
      name: workspace?.name || '',
      role: workspaceRole,
      inviteCode: workspace?.invite_code || null,
      subscriptionTier: (workspace?.subscription_tier ?? 'foundation') as 'foundation' | 'growth' | 'venue_os' | 'autonomous',
    } : null,
    integrations: {
      quickbooks: quickbooksConnected,
      qboRealmId,
    },
    members,
    locations,
  };
}

export default async function SettingsPage(props: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const data = await getSettingsData();
  const searchParams = await props.searchParams;
  
  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsContent data={data} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="h-10 w-48 bg-ink/5 rounded-lg animate-pulse" />
      <div className="liquid-panel p-6 space-y-6">
        <div className="h-6 w-32 bg-ink/5 rounded animate-pulse" />
        <div className="space-y-4">
          <div className="h-12 bg-ink/5 rounded-xl animate-pulse" />
          <div className="h-12 bg-ink/5 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  );
}

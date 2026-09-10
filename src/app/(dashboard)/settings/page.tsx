/**
 * Settings Page
 * Manage integrations, team, and account settings
 * @module app/(dashboard)/settings
 */

import { Suspense } from 'react';
import { createClient } from '@/shared/api/supabase/server';
import { redirect } from 'next/navigation';
import { SettingsContent } from './components/settings-content';
import { getWorkspaceMembers } from '@/app/actions/workspace';
import type { WorkspaceMemberData } from '@/app/actions/workspace';
import { getWorkspacePaymentDefaults, type WorkspacePaymentDefaults } from '@/features/org-management/api/payment-defaults-actions';

export const metadata = {
  title: 'Settings | Unusonic',
  description: 'Manage your Unusonic settings and integrations',
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
  
  /*
    Membership, and the workspace it points at.

    This select used to ask for `department`, `permissions` and the workspace's
    `invite_code`. None of those columns exist, so PostgREST answered 400,
    `workspaceMembership` came back null, and the entire settings page rendered
    with no workspace: no name, no team, no payment terms, no plan. Nothing said
    so, because a failed query and an absent row look identical here.

    Prefer role from workspace_roles.slug (role_id) when set so UI matches the DB.
  */
  const { data: workspaceMembership } = await supabase
    .from('workspace_members')
    .select(`
      workspace_id,
      role,
      role_id,
      workspaces:workspace_id (id, name, subscription_tier),
      workspace_roles:role_id (slug)
    `)
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();
  
  const rawWs = workspaceMembership?.workspaces;
  const workspace = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string; subscription_tier?: string | null } | null;
  const rawRole = workspaceMembership?.workspace_roles;
  const roleSlug = (Array.isArray(rawRole) ? rawRole[0] : rawRole) as { slug: string } | null;
  const resolvedRole = (roleSlug?.slug ?? workspaceMembership?.role ?? 'member') as string;
  const workspaceRole = (resolvedRole === 'observer' ? 'viewer' : resolvedRole) as 'owner' | 'admin' | 'member' | 'viewer';

  // Check QuickBooks connection status (qbo_configs = source of truth for new flow)
  const workspaceId = workspaceMembership?.workspace_id;
  let quickbooksConnected = false;
  let qboRealmId: string | null = null;
  let members: WorkspaceMemberData[] = [];
  let paymentDefaults: WorkspacePaymentDefaults | null = null;
  
  if (workspaceId) {
    /*
      QuickBooks connection state. The two reads this replaces went to
      `public.qbo_configs` and `public.finance` -- neither exists (finance is a
      schema, not a table), so both 404'd and the settings page reported
      QuickBooks disconnected whether or not it was. The connection lives in
      `finance.qbo_connections`.
    */
    const { data: qboConnection } = await supabase
      .schema('finance')
      .from('qbo_connections')
      .select('realm_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (qboConnection?.realm_id) {
      quickbooksConnected = true;
      qboRealmId = qboConnection.realm_id;
    }

    // Owners and admins see the team. The per-member `manage_team` flag that
    // used to widen this is gone with the column it was stored in; a role that
    // should be able to manage the team is granted that in /settings/roles.
    const isAdmin = workspaceRole === 'owner' || workspaceRole === 'admin';

    const [membersResult, paymentDefaultsResult] = await Promise.all([
      isAdmin ? getWorkspaceMembers(workspaceId) : null,
      isAdmin ? getWorkspacePaymentDefaults() : null,
    ]);

    if (membersResult?.success && membersResult.members) members = membersResult.members;
    if (paymentDefaultsResult) paymentDefaults = paymentDefaultsResult;
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
      subscriptionTier: (workspace?.subscription_tier ?? 'foundation') as 'foundation' | 'growth' | 'venue_os' | 'autonomous',
    } : null,
    integrations: {
      quickbooks: quickbooksConnected,
      qboRealmId,
    },
    members,
    paymentDefaults,
  };
}

export default async function SettingsPage(props: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const searchParams = await props.searchParams;

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <Suspense fallback={<SettingsSkeleton />}>
        <SettingsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function SettingsData({ searchParams }: { searchParams: { success?: string; error?: string } }) {
  const data = await getSettingsData();
  return <SettingsContent data={data} searchParams={searchParams} />;
}

function SettingsSkeleton() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      <div className="h-10 w-48 bg-[var(--stage-surface)] rounded-[var(--stage-radius-input)] stage-skeleton" />
      <div className="stage-panel p-6 space-y-6">
        <div className="h-6 w-32 bg-[var(--stage-surface)] rounded stage-skeleton" />
        <div className="space-y-4">
          <div className="h-12 bg-[var(--stage-surface)] rounded-xl stage-skeleton" />
          <div className="h-12 bg-[var(--stage-surface)] rounded-xl stage-skeleton" />
        </div>
      </div>
    </div>
  );
}

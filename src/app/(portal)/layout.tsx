/**
 * Portal Layout
 * Employee-facing portal with simplified navigation.
 * Auth-gated, role-aware via PortalProfileProvider.
 * @module app/(portal)/layout
 */

import { redirect } from 'next/navigation';
import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { WorkspaceProvider, type WorkspaceRole } from '@/shared/ui/providers/WorkspaceProvider';
import { PreferencesProvider } from '@/shared/ui/providers/PreferencesContext';
import { PortalProfileProvider } from '@/shared/ui/providers/PortalProfileProvider';
import { AuthGuard } from '@/shared/ui/providers/AuthGuard';
import { SessionExpiredOverlay } from '@/shared/ui/overlays/SessionExpiredOverlay';
import { InactivityLogoutProvider } from '@/shared/ui/providers/InactivityLogoutProvider';
import { resolvePortalProfile, getDefaultNavItems } from '@/shared/lib/portal-profiles';
import { PortalShell } from './components/portal-shell';

export const dynamic = 'force-dynamic';

async function getPortalContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select(`
      workspace_id,
      role,
      role_id,
      workspaces:workspace_id (
        id,
        name
      )
    `)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error || !membership) return null;

  // Resolve role slug via role_id → ops.workspace_roles
  let roleSlug: string | null = null;
  if (membership.role_id) {
    const { data: roleRow } = await supabase
      .schema('ops')
      .from('workspace_roles')
      .select('slug')
      .eq('id', membership.role_id)
      .maybeSingle();
    roleSlug = roleRow?.slug ?? null;
  }
  if (!roleSlug) roleSlug = (membership.role as string)?.toLowerCase() ?? null;

  const rawWorkspace = membership.workspaces;
  const workspace = (Array.isArray(rawWorkspace) ? rawWorkspace[0] : rawWorkspace) as { id: string; name: string } | null;

  return {
    workspaceId: membership.workspace_id as string,
    workspaceName: workspace?.name ?? null,
    role: membership.role as WorkspaceRole,
    roleSlug,
  };
}

/** Fetch entity_capabilities + crew_skills for portal profile resolution */
async function getProfileData(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, workspaceId: string | null) {
  // Resolve person entity
  const { data: person } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', userId)
    .eq('type', 'person')
    .maybeSingle();

  if (!person) return { capabilities: [], skillTags: [], adminOverride: null };

  // Fetch capabilities and skills in parallel
  const [capResult, skillResult, rosterResult] = await Promise.all([
    workspaceId
      ? supabase.schema('ops').from('entity_capabilities').select('capability').eq('entity_id', person.id).eq('workspace_id', workspaceId)
      : Promise.resolve({ data: [] as { capability: string }[] }),
    supabase.schema('ops').from('crew_skills').select('skill_tag').eq('entity_id', person.id),
    // Check for admin override on ROSTER_MEMBER edge
    supabase.schema('cortex').from('relationships').select('context_data')
      .eq('target_entity_id', person.id).eq('relationship_type', 'ROSTER_MEMBER').limit(1).maybeSingle(),
  ]);

  const capabilities = (capResult.data ?? []).map(r => r.capability);
  const skillTags = (skillResult.data ?? []).map(r => r.skill_tag);
  const rosterCtx = (rosterResult.data?.context_data ?? {}) as Record<string, unknown>;
  const adminOverride = (rosterCtx.primary_portal_profile as string) ?? null;

  return { capabilities, skillTags, adminOverride };
}

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userData: { email: string; fullName: string | null; avatarUrl: string | null } | null = null;
  let workspaceId: string | null = null;
  let workspaceName: string | null = null;
  let role: WorkspaceRole | null = null;
  let profileData = { capabilities: [] as string[], skillTags: [] as string[], adminOverride: null as string | null };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const ctx = await getPortalContext(supabase, user.id);

    // Non-employee roles should use the dashboard, not the portal
    if (ctx && ctx.roleSlug !== 'employee') {
      redirect('/lobby');
    }

    if (ctx) {
      workspaceId = ctx.workspaceId;
      workspaceName = ctx.workspaceName;
      role = ctx.role;
    }

    // Fetch profile + portal profile data in parallel
    const [profileResult, profileDataResult] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
      getProfileData(supabase, user.id, workspaceId),
    ]);

    userData = {
      email: user.email || '',
      fullName: profileResult.data?.full_name || null,
      avatarUrl: profileResult.data?.avatar_url || null,
    };

    profileData = profileDataResult;
  } catch (err) {
    unstable_rethrow(err);
    console.error('[Portal] Layout error:', err);
  }

  // Resolve portal profile
  const resolved = resolvePortalProfile({
    capabilities: profileData.capabilities,
    skillTags: profileData.skillTags,
    adminOverride: profileData.adminOverride,
  });

  const portalProfileValue = {
    primary: resolved.primary,
    all: resolved.all,
    navItems: resolved.navItems,
    capabilities: profileData.capabilities,
    skillTags: profileData.skillTags,
  };

  return (
    <WorkspaceProvider
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      role={role}
    >
      <PreferencesProvider>
        <PortalProfileProvider value={portalProfileValue}>
          <AuthGuard>
            <SessionExpiredOverlay />
            <InactivityLogoutProvider>
              <div className="min-h-screen h-full flex flex-col min-w-0 overscroll-none">
                <div className="fixed inset-0 z-0 bg-stage-void pointer-events-none" aria-hidden>
                  <div className="absolute inset-0 grain-overlay" aria-hidden />
                </div>
                <div className="relative z-10 flex flex-1 flex-col min-h-0 w-full min-w-0">
                  <PortalShell
                    user={userData}
                    workspaceName={workspaceName}
                    navItems={resolved.navItems}
                  />
                  <main className="flex-1 min-w-0 min-h-0 flex flex-col relative overflow-auto pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),5rem)] sm:pb-[max(env(safe-area-inset-bottom),1rem)]">
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col px-4 sm:px-6 lg:px-8 py-6">
                      {children}
                    </div>
                  </main>
                </div>
              </div>
            </InactivityLogoutProvider>
          </AuthGuard>
        </PortalProfileProvider>
      </PreferencesProvider>
    </WorkspaceProvider>
  );
}

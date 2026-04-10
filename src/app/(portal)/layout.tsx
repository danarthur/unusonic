/**
 * Portal Layout
 * Employee-facing portal with simplified navigation.
 * Auth-gated, role-aware via PortalProfileProvider.
 * @module app/(portal)/layout
 */

import { redirect } from 'next/navigation';
import { unstable_rethrow } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/shared/api/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/shared/lib/constants';
import { WorkspaceProvider, type WorkspaceRole } from '@/shared/ui/providers/WorkspaceProvider';
import { PreferencesProvider } from '@/shared/ui/providers/PreferencesContext';
import { PortalProfileProvider } from '@/shared/ui/providers/PortalProfileProvider';
import { AuthGuard } from '@/shared/ui/providers/AuthGuard';
import { SessionExpiredOverlay } from '@/shared/ui/overlays/SessionExpiredOverlay';
import { InactivityLogoutProvider } from '@/shared/ui/providers/InactivityLogoutProvider';
import { DensitySync } from '@/shared/ui/layout/DensitySync';
import { resolvePortalProfile, getDefaultNavItems } from '@/shared/lib/portal-profiles';
import { ReducedMotionProvider } from '@/shared/ui/providers/ReducedMotionProvider';
import { PortalSidebar } from './components/portal-sidebar';
import { PortalShell } from './components/portal-shell';

export const dynamic = 'force-dynamic';

async function getPortalContext(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const cookieStore = await cookies();
  const preferredWsId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;

  const portalSelect = `workspace_id, role, role_id, workspaces:workspace_id (id, name)`;

  // Try preferred workspace first
  let membership: { workspace_id: string; role: string; role_id: string | null; workspaces: unknown } | null = null;

  if (preferredWsId) {
    const { data } = await supabase
      .from('workspace_members')
      .select(portalSelect)
      .eq('user_id', userId)
      .eq('workspace_id', preferredWsId)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (data) membership = data as any;
  }

  if (!membership) {
    const { data, error } = await supabase
      .from('workspace_members')
      .select(portalSelect)
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    membership = data as any;
  }

  if (!membership) return null;

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

/** Fetch all workspace memberships for the switcher UI. */
async function getAllWorkspaces(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces:workspace_id (id, name)')
    .eq('user_id', userId);

  if (!data) return [];

  return data.map((row) => {
    const rawWs = row.workspaces;
    const ws = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string } | null;
    return {
      id: row.workspace_id as string,
      name: ws?.name ?? 'Unnamed',
      role: row.role as string,
    };
  });
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

  if (!person) return { personEntityId: null, capabilities: [], skillTags: [], adminOverride: null };

  // Fetch capabilities and skills in parallel
  const [capResult, skillResult, rosterResult] = await Promise.all([
    workspaceId
      ? supabase.schema('ops').from('entity_capabilities').select('capability').eq('entity_id', person.id).eq('workspace_id', workspaceId)
      : Promise.resolve({ data: [] as { capability: string }[] }),
    supabase.schema('ops').from('crew_skills').select('skill_tag').eq('entity_id', person.id),
    // Check for admin override on ROSTER_MEMBER edge
    supabase.schema('cortex').from('relationships').select('context_data')
      .eq('source_entity_id', person.id).eq('relationship_type', 'ROSTER_MEMBER').limit(1).maybeSingle(),
  ]);

  const capabilities = (capResult.data ?? []).map(r => r.capability);
  const skillTags = (skillResult.data ?? []).map(r => r.skill_tag);
  const rosterCtx = (rosterResult.data?.context_data ?? {}) as Record<string, unknown>;
  const adminOverride = (rosterCtx.primary_portal_profile as string) ?? null;

  return { personEntityId: person.id, capabilities, skillTags, adminOverride };
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
  let allWorkspaces: { id: string; name: string; role: string }[] = [];
  let profileData = { personEntityId: null as string | null, capabilities: [] as string[], skillTags: [] as string[], adminOverride: null as string | null };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const ctx = await getPortalContext(supabase, user.id);

    // Dashboard roles (owner/admin/member) should not access the portal
    const DASHBOARD_ROLES = ['owner', 'admin', 'member'];
    if (ctx && ctx.roleSlug && DASHBOARD_ROLES.includes(ctx.roleSlug)) {
      redirect('/');
    }

    if (ctx) {
      workspaceId = ctx.workspaceId;
      workspaceName = ctx.workspaceName;
      role = ctx.role;
    }

    // Fetch profile, portal profile data, and all workspaces in parallel
    const [profileResult, profileDataResult, workspacesResult] = await Promise.all([
      supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).maybeSingle(),
      getProfileData(supabase, user.id, workspaceId),
      getAllWorkspaces(supabase, user.id),
    ]);
    allWorkspaces = workspacesResult;

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

  // Strip non-serializable fields (RegExp, LucideIcon) for client transport
  const serializeProfile = (p: typeof resolved.primary) => ({
    key: p.key,
    label: p.label,
    matchCapabilities: p.matchCapabilities,
    matchSkillTags: p.matchSkillTags,
    matchGigRolePatterns: p.matchGigRolePatterns.map(r => r.source),
    navItemIds: p.navItemIds,
    defaultLanding: p.defaultLanding,
    hasGigWorkspace: p.hasGigWorkspace,
  });

  const portalProfileValue = {
    personEntityId: profileData.personEntityId,
    primary: serializeProfile(resolved.primary),
    all: resolved.all.map(serializeProfile),
    navItems: resolved.navItems.map(({ icon, ...rest }) => rest),
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
              <DensitySync />
              <ReducedMotionProvider>
              <div className="min-h-screen h-full flex flex-col min-w-0 overscroll-none">
                <div className="fixed inset-0 z-0 bg-stage-void pointer-events-none" aria-hidden>
                  <div className="absolute inset-0 grain-overlay" aria-hidden />
                </div>
                <a
                  href="#main-content"
                  className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[var(--stage-surface-elevated)] focus:text-[var(--stage-text-primary)]"
                >
                  Skip to main content
                </a>
                <div className="relative z-10 flex flex-1 min-h-0 w-full min-w-0">
                  {/* Desktop: sidebar */}
                  <div className="hidden lg:flex shrink-0 h-full">
                    <PortalSidebar
                      user={userData}
                      workspaceName={workspaceName}
                      workspaces={allWorkspaces}
                      activeWorkspaceId={workspaceId}
                      navItems={resolved.navItems.map(({ icon, ...rest }) => rest)}
                    />
                  </div>
                  {/* Mobile: bottom tab bar */}
                  <PortalShell
                    navItems={resolved.navItems.map(({ icon, ...rest }) => rest)}
                  />
                  {/* Content */}
                  <main id="main-content" className="flex-1 min-w-0 min-h-0 flex flex-col relative overflow-auto pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),5rem)] lg:pb-0" data-surface="void">
                    <div className="flex-1 min-h-0 min-w-0 flex flex-col px-4 sm:px-6 lg:px-8 py-6 max-w-2xl lg:max-w-5xl mx-auto w-full gap-6">
                      {children}
                    </div>
                  </main>
                </div>
              </div>
            </ReducedMotionProvider>
            </InactivityLogoutProvider>
          </AuthGuard>
        </PortalProfileProvider>
      </PreferencesProvider>
    </WorkspaceProvider>
  );
}

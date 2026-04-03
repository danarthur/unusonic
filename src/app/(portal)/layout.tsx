/**
 * Portal Layout
 * Employee-facing portal with simplified navigation.
 * Auth-gated but uses a simpler shell than the admin dashboard.
 * @module app/(portal)/layout
 */

import { redirect } from 'next/navigation';
import { unstable_rethrow } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { WorkspaceProvider, type WorkspaceRole } from '@/shared/ui/providers/WorkspaceProvider';
import { PreferencesProvider } from '@/shared/ui/providers/PreferencesContext';
import { AuthGuard } from '@/shared/ui/providers/AuthGuard';
import { SessionExpiredOverlay } from '@/shared/ui/overlays/SessionExpiredOverlay';
import { InactivityLogoutProvider } from '@/shared/ui/providers/InactivityLogoutProvider';
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
  // Fallback to legacy text role
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

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userData: { email: string; fullName: string | null; avatarUrl: string | null } | null = null;
  let workspaceId: string | null = null;
  let workspaceName: string | null = null;
  let role: WorkspaceRole | null = null;

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    userData = {
      email: user.email || '',
      fullName: profile?.full_name || null,
      avatarUrl: profile?.avatar_url || null,
    };
  } catch (err) {
    unstable_rethrow(err);
    console.error('[Portal] Layout error:', err);
  }

  return (
    <WorkspaceProvider
      workspaceId={workspaceId}
      workspaceName={workspaceName}
      role={role}
    >
      <PreferencesProvider>
        <AuthGuard>
          <SessionExpiredOverlay />
          <InactivityLogoutProvider>
            <div className="min-h-screen h-full flex flex-col min-w-0 overscroll-none">
              <div className="fixed inset-0 z-0 bg-stage-void pointer-events-none" aria-hidden>
                <div className="absolute inset-0 grain-overlay" aria-hidden />
              </div>
              <div className="relative z-10 flex flex-1 flex-col min-h-0 w-full min-w-0">
                <PortalShell user={userData} workspaceName={workspaceName} />
                <main className="flex-1 min-w-0 min-h-0 flex flex-col relative overflow-auto pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),1rem)]">
                  <div className="flex-1 min-h-0 min-w-0 flex flex-col px-4 sm:px-6 lg:px-8 py-6">
                    {children}
                  </div>
                </main>
              </div>
            </div>
          </InactivityLogoutProvider>
        </AuthGuard>
      </PreferencesProvider>
    </WorkspaceProvider>
  );
}

/**
 * Dashboard Layout
 * Protected layout with sidebar navigation and workspace context.
 * When user has no org, we do NOT redirect; let dashboard
 * render and the Network page (or other pages) show the Genesis flow inline so
 * the user is never stuck on a dead-end page.
 * @module app/(dashboard)/layout
 */

import { unstable_rethrow } from "next/navigation";
import { createClient } from "@/shared/api/supabase/server";
import { SidebarWithUser } from "@/shared/ui/layout/SidebarWithUser";
import { MobileDock } from "@/shared/ui/layout/MobileDock";
import { WorkspaceProvider, type WorkspaceRole } from "@/shared/ui/providers/WorkspaceProvider";
import { PreferencesProvider } from "@/shared/ui/providers/PreferencesContext";
import { SystemHeartProvider } from "@/shared/ui/providers/SystemHeartContext";
import { InactivityLogoutProvider } from "@/shared/ui/providers/InactivityLogoutProvider";

/** Dashboard uses cookies (Supabase auth) — always render on the server. */
export const dynamic = 'force-dynamic';

/**
 * Fetches the active workspace for the current user.
 * Must filter by user_id – RLS lets you see all members of your workspaces,
 * so without this we could get another member's row.
 */
async function getActiveWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select(`
      workspace_id,
      role,
      workspaces:workspace_id (
        id,
        name
      )
    `)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  
  if (error || !membership) {
    console.log('[Dashboard] No workspace found for user');
    return null;
  }
  
  const rawWorkspace = membership.workspaces;
  const workspace = (Array.isArray(rawWorkspace) ? rawWorkspace[0] : rawWorkspace) as { id: string; name: string } | null;
  
  return {
    id: membership.workspace_id as string,
    name: workspace?.name ?? null,
    role: membership.role as WorkspaceRole,
  };
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userData: { email: string; fullName: string | null; avatarUrl: string | null } | null = null;
  let activeWorkspace: { id: string; name: string | null; role: WorkspaceRole } | null = null;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      const [profileResult, workspaceResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .maybeSingle(),
        getActiveWorkspace(supabase, user.id),
      ]);
      
      const profile = profileResult.data;
      activeWorkspace = workspaceResult;
      userData = {
        email: user.email || '',
        fullName: profile?.full_name || null,
        avatarUrl: profile?.avatar_url || null,
      };
    }
  } catch (err) {
    unstable_rethrow(err);
    // Skip logging expected "couldn't be rendered statically because it used cookies" during build
    const isDynamicUsage =
      err && typeof err === 'object' && 'digest' in err && (err as { digest?: string }).digest === 'DYNAMIC_SERVER_USAGE';
    if (!isDynamicUsage) {
      console.error('[Dashboard] Layout error:', err);
    }
    // Continue with null workspace - pages can show degraded UI
  }

  return (
    <WorkspaceProvider
      workspaceId={activeWorkspace?.id ?? null}
      workspaceName={activeWorkspace?.name ?? null}
      role={activeWorkspace?.role ?? null}
    >
      <PreferencesProvider>
      <SystemHeartProvider>
      <InactivityLogoutProvider>
      {/* Single full-height wrapper; safe-area and dock padding on mobile */}
      <div className="min-h-screen h-full flex flex-col min-w-0 overscroll-none">
        {/* Same as login/onboarding: spotlight + grain — no colored orbs */}
        <div className="fixed inset-0 z-0 bg-signal-void pointer-events-none" aria-hidden>
          <div className="absolute inset-0 grain-overlay" aria-hidden />
        </div>

        {/* Main Layout: sidebar (desktop) + content; mobile gets dock instead of sidebar */}
        <div className="relative z-10 flex flex-1 min-h-0 w-full min-w-0">
          {/* Desktop: Sidebar (hidden on mobile) */}
          <div className="hidden lg:flex shrink-0 h-full">
            <SidebarWithUser
              user={userData}
              workspaceName={activeWorkspace?.name}
            />
          </div>
          {/* Content: extra bottom padding on mobile for dock + safe area */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col relative overflow-hidden bg-transparent pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),5rem)] lg:pb-0 lg:pt-0">
            <div className="flex-1 min-h-0 min-w-0 overflow-auto flex flex-col">
              {children}
            </div>
          </main>
        </div>

        {/* Mobile: Bottom dock (hidden on desktop) */}
        <div className="lg:hidden">
          <MobileDock
            user={userData}
            workspaceName={activeWorkspace?.name}
          />
        </div>
      </div>
      </InactivityLogoutProvider>
      </SystemHeartProvider>
      </PreferencesProvider>
    </WorkspaceProvider>
  );
}

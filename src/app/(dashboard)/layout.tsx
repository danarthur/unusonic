/**
 * Dashboard Layout
 * Protected layout with sidebar navigation and workspace context.
 * When user has no org, we do NOT redirect; let dashboard
 * render and the Network page (or other pages) show the Genesis flow inline so
 * the user is never stuck on a dead-end page.
 * @module app/(dashboard)/layout
 */

import { redirect, unstable_rethrow } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/shared/api/supabase/server";
import { ACTIVE_WORKSPACE_COOKIE_NAME } from "@/shared/lib/constants";
import { SidebarContainer } from "@/shared/ui/layout/SidebarContainer";
import { MobileDock } from "@/shared/ui/layout/MobileDock";
import { WorkspaceProvider, type WorkspaceRole } from "@/shared/ui/providers/WorkspaceProvider";
import { PreferencesProvider } from "@/shared/ui/providers/PreferencesContext";
import { SystemHeartProvider } from "@/shared/ui/providers/SystemHeartContext";
import { InactivityLogoutProvider } from "@/shared/ui/providers/InactivityLogoutProvider";
import { AuthGuard } from "@/shared/ui/providers/AuthGuard";
import { SessionExpiredOverlay } from "@/features/auth/smart-login/ui/SessionExpiredOverlay";
import { DensitySync } from "@/shared/ui/layout/DensitySync";
import { SoundProvider } from "@/shared/ui/providers/SoundProvider";
import { PasskeyNudgeBanner } from "@/widgets/passkey-nudge-banner/PasskeyNudgeBanner";
import { GuardianSetupReminder } from "@/widgets/guardian-setup-reminder";
import { getAuthFlag } from "@/shared/lib/auth-flags";
import { AionNoticeHost } from "@/app/(dashboard)/(features)/aion/components/AionNoticeHost";

/** Dashboard uses cookies (Supabase auth) — always render on the server. */
export const dynamic = 'force-dynamic';

/**
 * Fetches the active workspace for the current user.
 * Must filter by user_id – RLS lets you see all members of your workspaces,
 * so without this we could get another member's row.
 */
type MembershipRow = {
  workspace_id: string;
  role: string;
  workspaces: { id: string; name: string; subscription_tier?: string; signalpay_enabled?: boolean } | { id: string; name: string; subscription_tier?: string; signalpay_enabled?: boolean }[] | null;
};

function formatMembership(membership: MembershipRow) {
  const rawWorkspace = membership.workspaces;
  const workspace = (Array.isArray(rawWorkspace) ? rawWorkspace[0] : rawWorkspace) as {
    id: string;
    name: string;
    subscription_tier?: string;
    signalpay_enabled?: boolean;
  } | null;

  return {
    id: membership.workspace_id as string,
    name: workspace?.name ?? null,
    role: membership.role as WorkspaceRole,
    subscriptionTier: workspace?.subscription_tier ?? null,
    signalpayEnabled: workspace?.signalpay_enabled ?? false,
  };
}

const WS_SELECT = `workspace_id, role, workspaces:workspace_id (id, name, subscription_tier, signalpay_enabled)`;

async function getActiveWorkspace(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
  const cookieStore = await cookies();
  const preferredWsId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;

  // Try preferred workspace first
  if (preferredWsId) {
    const { data: membership } = await supabase
      .from('workspace_members')
      .select(WS_SELECT)
      .eq('user_id', userId)
      .eq('workspace_id', preferredWsId)
      .maybeSingle();

    if (membership) return formatMembership(membership as MembershipRow);
  }

  // Fallback: first available workspace
  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select(WS_SELECT)
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error || !membership) {
    console.log('[Dashboard] No workspace found for user');
    return null;
  }

  return formatMembership(membership as MembershipRow);
}

/** Fetch all workspace memberships for the switcher UI. */
async function getAllWorkspaces(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
) {
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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let userData: { email: string; fullName: string | null; avatarUrl: string | null } | null = null;
  let activeWorkspace: {
    id: string;
    name: string | null;
    role: WorkspaceRole;
    subscriptionTier: string | null;
    signalpayEnabled: boolean;
  } | null = null;
  let allWorkspaces: { id: string; name: string; role: string }[] = [];
  // Resolved server-side so the auth flag never lands in the client bundle.
  // The reminder widget itself gates on the boolean we pass down.
  const guardianGateEnabled = getAuthFlag('AUTH_V2_GUARDIAN_GATE');
  const authV2LoginCard = getAuthFlag('AUTH_V2_LOGIN_CARD');

  try {
    const supabase = await createClient();
    // Auth-boundary perf (Phase 1, load-time-strategy.md §3.9): proxy.ts
    // already validated the session via getClaims() (~5ms JWT decode). Use
    // the same fast path here instead of getUser() (~50-150ms GoTrue
    // round-trip). RLS still gates every query, so a stale-but-valid JWT
    // can't leak data; if the user was banned mid-session, GoTrue
    // refresh-or-fail in AuthGuard catches it on the next visibility tick.
    const { data: claimsData, error: claimsError } =
      await supabase.auth.getClaims();
    const claims = !claimsError ? claimsData?.claims : null;
    const userId = (claims?.sub as string | undefined) ?? null;
    const userEmail = (claims?.email as string | undefined) ?? '';

    if (!userId) {
      redirect('/login');
    }

    const [profileResult, workspaceResult, workspacesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('full_name, avatar_url, onboarding_completed')
        .eq('id', userId)
        .maybeSingle(),
      getActiveWorkspace(supabase, userId),
      getAllWorkspaces(supabase, userId),
    ]);

    const profile = profileResult.data;

    // Onboarding guard: redirect if setup not completed
    if (!profile?.onboarding_completed) {
      redirect('/onboarding');
    }

    activeWorkspace = workspaceResult;
    allWorkspaces = workspacesResult;

    // Role guard (defense in depth): portal roles should not access dashboard
    const DASHBOARD_ROLES = ['owner', 'admin', 'member'];
    if (activeWorkspace?.role && !DASHBOARD_ROLES.includes(activeWorkspace.role)) {
      redirect('/');
    }

    // SignalPay gating: autonomous tier must enable payouts before proceeding
    if (
      activeWorkspace?.subscriptionTier === 'autonomous' &&
      !activeWorkspace?.signalpayEnabled
    ) {
      redirect('/settings/connect-payouts');
    }

    userData = {
      email: userEmail,
      fullName: profile?.full_name || null,
      avatarUrl: profile?.avatar_url || null,
    };
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
      <AuthGuard>
      <SessionExpiredOverlay authV2LoginCard={authV2LoginCard} />
      <InactivityLogoutProvider>
      <DensitySync />
      <SoundProvider>
      {/* Single full-height wrapper; safe-area and dock padding on mobile */}
      <div className="min-h-screen h-full flex flex-col min-w-0 overscroll-none">
        {/* Stage Engineering void: density-aware background + grain */}
        <div className="fixed inset-0 z-0 bg-stage-void pointer-events-none" aria-hidden>
          <div className="absolute inset-0 grain-overlay" aria-hidden />
        </div>

        {/* Main Layout: sidebar (desktop) + content; mobile gets dock instead of sidebar */}
        <div className="relative z-10 flex flex-1 min-h-0 w-full min-w-0">
          {/* Desktop: Sidebar (hidden on mobile) */}
          <SidebarContainer
            user={userData}
            workspaceName={activeWorkspace?.name}
            workspaces={allWorkspaces}
            activeWorkspaceId={activeWorkspace?.id ?? null}
          />
          {/* Content: extra bottom padding on mobile for dock + safe area */}
          <main className="flex-1 min-w-0 min-h-0 flex flex-col relative overflow-hidden bg-transparent pt-[env(safe-area-inset-top)] pb-[max(env(safe-area-inset-bottom),5rem)] lg:pb-0 lg:pt-0">
            <PasskeyNudgeBanner />
            <GuardianSetupReminder flagEnabled={guardianGateEnabled} />
            <AionNoticeHost />
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
      </SoundProvider>
      </InactivityLogoutProvider>
      </AuthGuard>
      </SystemHeartProvider>
      </PreferencesProvider>
    </WorkspaceProvider>
  );
}

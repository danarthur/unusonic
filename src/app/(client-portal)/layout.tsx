/**
 * Client portal route group layout.
 *
 * Route group: (client-portal)
 * URL prefix: /client/*
 *
 * Resolves the current portal context via getClientPortalContext(). This
 * layout intentionally does NOT write cookies (Server Component constraint
 * in Next.js 16) — rotation happens in the DB only, and mint happens via
 * the /api/client-portal/mint-from-proposal route handler on first touch.
 *
 * Auth gating:
 *   - kind='none' on any page except /client/sign-in → redirect to sign-in
 *   - kind='none' on /client/sign-in → render the sign-in form
 *   - kind='anonymous' or 'claimed' → pass through to the child page
 *
 * See client-portal-design.md §15.3, §16.1.
 */
import 'server-only';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { headers as nextHeaders } from 'next/headers';
import * as Sentry from '@sentry/nextjs';

import {
  getClientPortalContext,
  rotateClientPortalSession,
} from '@/shared/lib/client-portal';
import { createClient } from '@/shared/api/supabase/server';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/shared/lib/constants';
import { WorkspaceSwitcher, type WorkspaceEntry } from '@/shared/ui/layout/WorkspaceSwitcher';

/** Fetch all workspace memberships for a claimed client's switcher. */
async function getClientWorkspaces(userId: string): Promise<WorkspaceEntry[]> {
  const supabase = await createClient();
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

export default async function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await nextHeaders();
  const pathname = h.get('x-pathname') ?? h.get('x-invoke-path') ?? '';

  const context = await getClientPortalContext();

  // Rotate anonymous sessions in the background (DB only, no cookie writes).
  if (context.kind === 'anonymous') {
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      null;
    const ua = h.get('user-agent');
    // Fire-and-forget — don't block the render on rotation.
    // Repeated rotation failures would silently expire the session into the
    // dead-end /client/sign-in page, so capture to Sentry for observability.
    rotateClientPortalSession({ ip, userAgent: ua }).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      Sentry.logger.error('clientPortal.layout.sessionRotationFailed', {
        contextKind: context.kind,
        error: message,
      });
    });
  }

  const isSignInRoute =
    pathname.startsWith('/client/sign-in') || pathname === '/client/sign-in';

  if (context.kind === 'none' && !isSignInRoute) {
    redirect('/client/sign-in');
  }

  // For claimed clients with multiple workspaces, show the workspace switcher.
  let workspaces: WorkspaceEntry[] = [];
  let activeWorkspaceId: string | null = null;
  if (context.kind === 'claimed' && context.userId) {
    workspaces = await getClientWorkspaces(context.userId);
    if (workspaces.length > 1) {
      const cookieStore = await cookies();
      activeWorkspaceId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value ?? null;
    }
  }

  const showSwitcher = workspaces.length > 1;

  return (
    <div className="min-h-dvh bg-stage-canvas" style={{ color: 'var(--stage-text-primary)' }}>
      {showSwitcher && (
        <div className="border-b border-[var(--stage-edge-subtle)] px-4 py-2">
          <div className="mx-auto max-w-2xl">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspaceId={activeWorkspaceId}
            />
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

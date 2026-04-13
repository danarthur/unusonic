/**
 * Diagnostic: workspace resolution, event/gig counts, and "Context Integrity Check."
 * Detects "Ghost Data" – rows in workspaces you're NOT a member of (invisible to the app).
 * GET /api/debug/workspace – run while logged in.
 * Remove or protect this route in production.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getSession, SessionError } from '@/shared/lib/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({
        ok: false,
        error: 'Not authenticated',
        hint: 'Log in and call GET /api/debug/workspace again',
      });
    }

    const workspaceIdFromLib = await getActiveWorkspaceId();
    const session = await getSession();
    const workspaceIdFromSession = session.workspace.id;
    const activeWorkspaceId = workspaceIdFromLib ?? workspaceIdFromSession;

    // My workspace memberships
    const { data: memberships } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id);

    const myWorkspaceIds = new Set((memberships ?? []).map((m) => m.workspace_id as string));

    // 1. What we SEE: counts in active workspace (RLS applies) – ops.events
    const eventsInActiveRes = await supabase
      .schema('ops')
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', activeWorkspaceId ?? '');

    // 2. Ghost Data: events in workspaces we're NOT a member of
    const system = getSystemClient();
    const { data: eventsByWorkspace } = await system.schema('ops').from('events').select('workspace_id') as { data: { workspace_id: string }[] | null };

    const eventWorkspaceCounts: Record<string, number> = {};
    for (const e of eventsByWorkspace ?? []) {
      const wid = (e as { workspace_id?: string }).workspace_id;
      if (wid) eventWorkspaceCounts[wid] = (eventWorkspaceCounts[wid] ?? 0) + 1;
    }

    const orphanEventWorkspaces = Object.keys(eventWorkspaceCounts).filter((wid) => !myWorkspaceIds.has(wid));
    const ghostEventsCount = orphanEventWorkspaces.reduce((s, wid) => s + (eventWorkspaceCounts[wid] ?? 0), 0);
    const otherEventsCount = Object.keys(eventWorkspaceCounts)
      .filter((wid) => myWorkspaceIds.has(wid) && wid !== activeWorkspaceId)
      .reduce((s, wid) => s + (eventWorkspaceCounts[wid] ?? 0), 0);
    const drift = ghostEventsCount > 0 || otherEventsCount > 0;

    // Sample rows in active workspace (ops.events)
    const { data: eventRows } = await supabase
      .schema('ops')
      .from('events')
      .select('id, title, workspace_id, starts_at')
      .eq('workspace_id', activeWorkspaceId ?? '')
      .limit(5);

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email },
      workspace: {
        fromGetActiveWorkspaceId: workspaceIdFromLib,
        fromSession: workspaceIdFromSession,
        used: activeWorkspaceId,
        match: workspaceIdFromLib === workspaceIdFromSession,
      },
      counts: {
        events_in_active_workspace: eventsInActiveRes.count ?? 0,
        events_in_other_my_workspaces: otherEventsCount,
        ghost_events: ghostEventsCount,
        my_workspace_memberships: memberships?.length ?? 0,
      },
      context_integrity: {
        drift,
        message: drift
          ? 'Data exists outside your active workspace context. See ghost_* and *_in_other_my_workspaces.'
          : 'Context aligned – all visible events are in your active workspace.',
      },
      ghost_detail: {
        event_workspace_ids: orphanEventWorkspaces,
        event_workspace_counts: eventWorkspaceCounts,
      },
      my_memberships: memberships ?? [],
      sample_events: eventRows ?? [],
      hints: [
        'ghost_* = rows in workspaces you are NOT a member of (invisible to app).',
        'Run docs/supabase-debug-events-sync.sql then migrations to re-home orphans.',
      ],
    });
  } catch (err) {
    if (err instanceof SessionError) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

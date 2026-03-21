/**
 * Identity Bridge: returns the current user's session and workspace.
 * Resolves real session from Supabase Auth + workspace_members when logged in;
 * falls back to DEV_SESSION when unauthenticated (e.g. dev/demo).
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export const DEV_SESSION = {
  user: {
    id: 'dev-user-001',
    name: 'Daniel Arthur',
    role: 'owner',
    avatar: 'https://avatar.vercel.sh/daniel',
  },
  workspace: {
    id: '7c977570-ae46-444f-91db-90a5f595b819',
    name: 'Signal Main',
    plan: 'enterprise',
  },
};

export type Session = typeof DEV_SESSION;

export async function getSession(): Promise<Session> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return DEV_SESSION;
    }

    // Same ordering as dashboard layout and getActiveWorkspaceId() so session.workspace.id
    // always matches the active workspace (avoids "events disappeared" when fallback was used).
    const { data: membership, error: memberError } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces:workspace_id (id, name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (memberError || !membership) {
      return DEV_SESSION;
    }

    const rawWs = membership.workspaces;
    const ws = (Array.isArray(rawWs) ? rawWs[0] : rawWs) as { id: string; name: string } | null;

    return {
      user: {
        id: user.id,
        name: user.user_metadata?.full_name ?? user.email ?? 'User',
        role: membership.role ?? 'member',
        avatar: user.user_metadata?.avatar_url ?? undefined,
      },
      workspace: {
        id: membership.workspace_id,
        name: ws?.name ?? 'Workspace',
        plan: 'enterprise' as const,
      },
    };
  } catch {
    return DEV_SESSION;
  }
}

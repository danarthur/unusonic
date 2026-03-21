/**
 * Shared workspace resolution for server components.
 * Use getSession().workspace.id for session-based flows;
 * use getActiveWorkspaceId for explicit DB lookup matching dashboard layout.
 * @module shared/lib/workspace
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

/**
 * Returns the active workspace ID for the current user.
 * Must filter by user_id – RLS lets you see all members of your workspaces,
 * so without this we could get another member's row.
 */
export async function getActiveWorkspaceId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: membership, error } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (error || !membership) return null;
    return membership.workspace_id as string;
  } catch {
    return null;
  }
}

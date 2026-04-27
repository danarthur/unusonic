/**
 * Shared workspace-role helpers for org-management server actions.
 *
 * Server-only utilities, not exported as actions themselves.
 */

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type RequireRoleResult =
  | { ok: true; supabase: SupabaseServerClient }
  | { ok: false; error: string };

/** Resolve the active session and assert the user is admin/owner of the workspace. */
export async function requireAdminOrOwner(workspaceId: string): Promise<RequireRoleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated.' };

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    return { ok: false, error: 'Unauthorized. Owner or admin role required.' };
  }

  return { ok: true, supabase };
}

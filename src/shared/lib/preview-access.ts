/**
 * Authorization guard for admin preview mode.
 *
 * Verifies the current user is an owner/admin on the active workspace
 * and that the target entity belongs to that workspace. Returns the
 * entity summary on success; redirects on failure.
 *
 * @module shared/lib/preview-access
 */
import 'server-only';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { ACTIVE_WORKSPACE_COOKIE_NAME } from '@/shared/lib/constants';

const PREVIEW_ALLOWED_ROLES = ['owner', 'admin'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PreviewEntity = {
  id: string;
  displayName: string;
  ownerWorkspaceId: string;
  type: string;
};

/**
 * Verifies the current user can preview the given entity's portal.
 *
 * Checks:
 *   1. User is authenticated
 *   2. Entity ID is a valid UUID
 *   3. User is owner/admin on the active workspace
 *   4. Entity belongs to that workspace
 *
 * Returns the entity summary. Redirects to /lobby on any failure.
 */
export async function verifyPreviewAccess(entityId: string): Promise<PreviewEntity> {
  // 1. Validate entity ID format (prevent injection)
  if (!UUID_RE.test(entityId)) {
    redirect('/lobby');
  }

  // 2. Authenticate
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // 3. Resolve active workspace + verify admin role
  //    Try the active workspace cookie first; fall back to first membership
  //    (cookie only exists after an explicit workspace switch).
  const cookieStore = await cookies();
  const activeWsId = cookieStore.get(ACTIVE_WORKSPACE_COOKIE_NAME)?.value;

  type Membership = { workspace_id: string; role: string };
  let membership: Membership | null = null;
  if (activeWsId) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .eq('workspace_id', activeWsId)
      .maybeSingle();
    membership = data as Membership | null;
  }
  if (!membership) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();
    membership = data as Membership | null;
  }

  if (!membership || !PREVIEW_ALLOWED_ROLES.includes(membership.role)) {
    redirect('/lobby');
  }

  // 4. Verify entity belongs to this workspace
  const system = getSystemClient();
  const { data: entity } = await system
    .schema('directory')
    .from('entities')
    .select('id, display_name, owner_workspace_id, type')
    .eq('id', entityId)
    .eq('owner_workspace_id', membership.workspace_id)
    .maybeSingle();

  if (!entity) {
    redirect('/lobby');
  }

  return {
    id: entity.id as string,
    displayName: entity.display_name as string,
    ownerWorkspaceId: entity.owner_workspace_id as string,
    type: entity.type as string,
  };
}

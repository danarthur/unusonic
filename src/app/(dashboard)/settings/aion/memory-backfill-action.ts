'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import {
  backfillWorkspaceContentEmbeddings,
  type BackfillResult,
} from '@/app/api/aion/lib/backfill-embeddings';

export type MemoryBackfillResult =
  | { success: true; workspaceId: string; result: BackfillResult }
  | { success: false; error: string };

export async function runMemoryBackfill(): Promise<MemoryBackfillResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in.' };

  const { data: roleData } = await supabase.rpc('get_member_role_slug', {
    p_workspace_id: workspaceId,
  });
  const roleSlug = roleData as string | null;
  if (roleSlug !== 'owner' && roleSlug !== 'admin') {
    return { success: false, error: 'Admin or owner role required.' };
  }

  const result = await backfillWorkspaceContentEmbeddings(workspaceId);
  return { success: true, workspaceId, result };
}

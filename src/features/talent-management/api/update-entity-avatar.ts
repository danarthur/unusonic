'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ─── Input schema ─────────────────────────────────────────────────────────────

// Only allow URLs from our own Supabase storage — reject arbitrary external URLs.
const SUPABASE_STORAGE_ORIGIN = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

const UpdateEntityAvatarSchema = z.object({
  entityId: z.string().uuid(),
  avatarUrl: z.string().url().refine(
    (url) => SUPABASE_STORAGE_ORIGIN && url.startsWith(SUPABASE_STORAGE_ORIGIN),
    { message: 'Avatar URL must be a Supabase storage URL.' }
  ),
});

// ─── Return type ──────────────────────────────────────────────────────────────

export type AvatarUpdateResult = { ok: true } | { ok: false; error: string };

// ─── Action ───────────────────────────────────────────────────────────────────

export async function updateEntityAvatar(input: unknown): Promise<AvatarUpdateResult> {
  // 1. Parse and validate input
  const parsed = UpdateEntityAvatarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid input.' };
  }

  const { entityId, avatarUrl } = parsed.data;

  // 2. Auth — verify caller has an active workspace
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { ok: false, error: 'No active workspace.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'Not authenticated.' };
  }

  // 3. Ownership guard — entity must be owned by the caller's workspace
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('owner_workspace_id')
    .eq('id', entityId)
    .maybeSingle();

  if (!entity || entity.owner_workspace_id !== workspaceId) {
    return { ok: false, error: 'Not authorised.' };
  }

  // 4. Write avatar_url directly to the entity column
  const { error: updateError } = await supabase
    .schema('directory')
    .from('entities')
    .update({ avatar_url: avatarUrl })
    .eq('id', entityId)
    .eq('owner_workspace_id', workspaceId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  // 5. Revalidate and return
  revalidatePath('/network');
  return { ok: true };
}

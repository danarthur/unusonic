'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

/**
 * Resolve an event's originating deal via ops.events.deal_id.
 * Replaces the old getDealByEventId which scanned public.deals by event_id.
 */
export async function getDealIdForEvent(
  eventId: string,
): Promise<string | null> {
  const parsed = z.string().uuid().safeParse(eventId);
  if (!parsed.success) return null;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();

  const { data } = await supabase
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  return (data?.deal_id as string) ?? null;
}

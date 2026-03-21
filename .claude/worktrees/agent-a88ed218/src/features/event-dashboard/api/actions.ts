'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { updateEventSchema, type UpdateEventInput } from '@/entities/event';

export type UpdateEventDetailsResult = { ok: true } | { ok: false; error: string };

export async function updateEventDetails(
  eventId: string,
  data: UpdateEventInput
): Promise<UpdateEventDetailsResult> {
  const parsed = updateEventSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, error: z.prettifyError(parsed.error) ?? 'Validation failed' };
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: 'Unauthorized' };
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const workspaceId = membership?.workspace_id ?? null;
  if (!workspaceId) {
    return { ok: false, error: 'No workspace' };
  }

  const payload = parsed.data as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (v !== undefined) filtered[k] = v;
  }

  const { error } = await supabase
    .from('events')
    .update({ ...filtered, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[event-dashboard] updateEventDetails:', error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/calendar');
  return { ok: true };
}

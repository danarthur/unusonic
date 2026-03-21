'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { updateEventSchema, type UpdateEventInput } from '@/entities/event';

export type UpdateEventCommandResult = { ok: true } | { ok: false; error: string };

/**
 * Server Action: partial update of an event (Command Center).
 * Validates with Zod, updates events table, revalidates event page.
 */
export async function updateEventCommand(
  id: string,
  data: Partial<UpdateEventInput>
): Promise<UpdateEventCommandResult> {
  const parsed = updateEventSchema.safeParse(data);
  if (!parsed.success) {
    const msg =
      parsed.error.issues?.map((i) => i.message).join(', ') ??
      parsed.error.message ??
      'Validation failed';
    return { ok: false, error: msg };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
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
  if (Object.keys(filtered).length === 0) {
    return { ok: true };
  }

  const { error } = await supabase
    .from('events')
    .update({ ...filtered, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[event-dashboard] updateEventCommand:', error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath(`/events/${id}`);
  revalidatePath('/calendar');
  return { ok: true };
}

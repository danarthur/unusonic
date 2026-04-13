'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

const ShowDayContactSchema = z.object({
  role: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  phone: z.string().max(30).nullable(),
  email: z.string().email().max(200).nullable(),
});

const UpdateEventContactsSchema = z.array(ShowDayContactSchema).max(20);

export type ShowDayContact = z.infer<typeof ShowDayContactSchema>;
export type UpdateEventContactsResult = { success: true } | { success: false; error: string };

/**
 * Updates the show_day_contacts JSONB array on an ops.events row.
 * Workspace ownership verified via project join.
 */
export async function updateEventContacts(
  eventId: string,
  contacts: ShowDayContact[]
): Promise<UpdateEventContactsResult> {
  try {
    const idParsed = z.string().uuid().safeParse(eventId);
    if (!idParsed.success) return { success: false, error: 'Invalid event ID.' };

    const parsed = UpdateEventContactsSchema.safeParse(contacts);
    if (!parsed.success) {
      return { success: false, error: parsed.error.message };
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    // Verify workspace ownership via direct workspace_id
    const { data: evt } = await supabase
      .schema('ops')
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (!evt) return { success: false, error: 'Not authorised' };

    const { error } = await supabase
      .schema('ops')
      .from('events')
      .update({ show_day_contacts: parsed.data })
      .eq('id', eventId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/crm');
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to save.' };
  }
}

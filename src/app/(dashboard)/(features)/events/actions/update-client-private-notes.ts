'use server';

/**
 * The private notes on a deal's client, written from the client drawer.
 *
 * The same row the record page's "How to handle" card writes:
 * `directory.entity_working_notes`, keyed (workspace_id, entity_id). A note
 * taken here and a note taken on the contact are one note, which is the whole
 * reason this does not have its own table.
 *
 * It replaces `updatePrivateNotes`, which wrote `public.org_private_data` --
 * a table that does not exist. The upsert answered 404, the drawer showed a
 * generic failure, and what somebody typed about a client was gone.
 *
 * @module app/events/actions/update-client-private-notes
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { updateWorkingNotes } from '@/widgets/network-detail/api/update-working-notes';

export type UpdateClientPrivateNotesResult = { ok: true } | { ok: false; error: string };

/**
 * @param entityId `directory.entities.id` — `DealClientContext.organization.entityId`,
 *   NOT `organization.id`, which is a legacy org id on two of the three paths
 *   that resolve a client.
 * @param notes    null or '' clears the note; both mean the same thing here.
 */
export async function updateClientPrivateNotes(
  entityId: string | null,
  notes: string | null,
): Promise<UpdateClientPrivateNotesResult> {
  if (!entityId) {
    return { ok: false, error: 'This client has no contact record to attach notes to.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { ok: false, error: 'No active workspace.' };

  const result = await updateWorkingNotes(workspaceId, entityId, {
    privateNotes: notes ?? '',
  });
  if (!result.ok) return result;

  revalidatePath('/events');
  revalidatePath('/network');
  return { ok: true };
}

/**
 * updateWorkingNotes — patch workspace-scoped working notes for one person.
 *
 * Patch semantics (mirrors the upsert_entity_working_notes RPC):
 *   • Field omitted from patch → leave unchanged
 *   • Field set to null        → leave unchanged (same as omitted)
 *   • Field set to ''          → clear the field (explicit delete)
 *   • Field set to a value     → upsert
 *
 * `dnr` lets you flag/unflag and set reason/note atomically. Unflagging
 * (dnr: { flagged: false }) leaves reason/note in place so history survives
 * the toggle — pass empty strings to clear them.
 *
 * Design: docs/reference/network-page-ia-redesign.md §4.1.
 */

'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import type {
  WorkingNotesChannel,
  WorkingNotesDnrReason,
} from './get-working-notes';
import { PRIVATE_NOTES_MAX, privateNotesTooLong } from '../model/working-notes-limits';
import { workingNotesRpcArgs } from '../model/working-notes-args';
import { workingNotesErrorMessage } from '../model/working-notes-errors';

export type UpdateWorkingNotesPatch = {
  communicationStyle?: string | null;
  dnr?: {
    flagged?: boolean;
    reason?: WorkingNotesDnrReason | '' | null;
    note?: string | null;
  };
  preferredChannel?: WorkingNotesChannel | '' | null;
  /** Free text kept about the contact. '' clears it, as with every field here. */
  privateNotes?: string | null;
};



export type UpdateWorkingNotesResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateWorkingNotes(
  workspaceId: string,
  entityId: string,
  patch: UpdateWorkingNotesPatch,
): Promise<UpdateWorkingNotesResult> {
  if (privateNotesTooLong(patch.privateNotes)) {
    return { ok: false, error: `Notes are limited to ${PRIVATE_NOTES_MAX} characters.` };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  const { data, error } = await supabase
    .schema('directory')
    .rpc('upsert_entity_working_notes', {
      p_workspace_id: workspaceId,
      p_entity_id: entityId,
      ...workingNotesRpcArgs(patch),
      p_source: 'manual',
    });

  if (error) return { ok: false, error: (error as { message: string }).message };

  // The RPC returns `{ ok, error }` -- a named reason rather than a bare false,
  // so a refusal can be told from the six other refusals it used to look like.
  const result = data as { ok?: boolean; error?: string } | null;
  if (!result?.ok) {
    return { ok: false, error: workingNotesErrorMessage(result?.error) };
  }

  revalidatePath(`/network/entity/${entityId}`);
  return { ok: true };
}

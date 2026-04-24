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

export type UpdateWorkingNotesPatch = {
  communicationStyle?: string | null;
  dnr?: {
    flagged?: boolean;
    reason?: WorkingNotesDnrReason | '' | null;
    note?: string | null;
  };
  preferredChannel?: WorkingNotesChannel | '' | null;
};

export type UpdateWorkingNotesResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateWorkingNotes(
  workspaceId: string,
  entityId: string,
  patch: UpdateWorkingNotesPatch,
): Promise<UpdateWorkingNotesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('upsert_entity_working_notes', {
      p_workspace_id: workspaceId,
      p_entity_id: entityId,
      p_communication_style: patch.communicationStyle ?? null,
      p_dnr_flagged: patch.dnr?.flagged ?? null,
      p_dnr_reason: patch.dnr?.reason ?? null,
      p_dnr_note: patch.dnr?.note ?? null,
      p_preferred_channel: patch.preferredChannel ?? null,
      p_source: 'manual',
    });

  if (error) return { ok: false, error: (error as { message: string }).message };
  if (data === false) {
    return { ok: false, error: 'Write refused — workspace mismatch or invalid value.' };
  }

  revalidatePath(`/network/entity/${entityId}`);
  return { ok: true };
}

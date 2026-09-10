/**
 * Patch → RPC arguments. Plain module, no `'use server'`.
 *
 * Every field is `undefined` when absent, never null: the RPC reads NULL as
 * "leave this alone" and `''` as "clear it", and supabase-js drops undefined
 * keys from the request body so the parameter default applies. Passing null
 * explicitly would mean the same thing, but only by coincidence of the default
 * -- omitting is what the contract actually asks for.
 *
 * It lives beside the action rather than inside it because the `??` chain is
 * most of that function's branching, and an action that is one guard and one
 * call reads better than one that is a guard, a mapping and a call.
 *
 * @module widgets/network-detail/model/working-notes-args
 */

import type { UpdateWorkingNotesPatch } from '../api/update-working-notes';

export type WorkingNotesRpcArgs = {
  p_communication_style?: string;
  p_dnr_flagged?: boolean;
  p_dnr_reason?: string;
  p_dnr_note?: string;
  p_preferred_channel?: string;
  p_private_notes?: string;
};

export function workingNotesRpcArgs(patch: UpdateWorkingNotesPatch): WorkingNotesRpcArgs {
  return {
    p_communication_style: patch.communicationStyle ?? undefined,
    p_dnr_flagged: patch.dnr?.flagged ?? undefined,
    p_dnr_reason: patch.dnr?.reason ?? undefined,
    p_dnr_note: patch.dnr?.note ?? undefined,
    p_preferred_channel: patch.preferredChannel ?? undefined,
    p_private_notes: patch.privateNotes ?? undefined,
  };
}

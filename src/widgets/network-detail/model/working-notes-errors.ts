/**
 * What the working-notes RPC refused, and what to say about it.
 *
 * `upsert_entity_working_notes` used to return a bare boolean. FALSE meant any
 * of seven things -- not signed in, bad source, not a member, entity in another
 * workspace, an invalid DNR reason, an invalid channel, or a capture trying to
 * write a private note -- and the caller collapsed all of them into "Write
 * refused — workspace mismatch or invalid value." A write that fails for a
 * reason nobody can name is the same undiagnosable-write problem the schema
 * audit existed to end, sitting inside the audit's own fix.
 *
 * The database returns a code; the wording lives here, because copy belongs
 * where the voice guide is and not in a migration.
 *
 * @module widgets/network-detail/model/working-notes-errors
 */

export const WORKING_NOTES_ERROR_CODES = [
  'not_authenticated',
  'invalid_source',
  'not_a_member',
  'entity_not_in_workspace',
  'invalid_dnr_reason',
  'invalid_preferred_channel',
  'capture_cannot_write_private_note',
] as const;

export type WorkingNotesErrorCode = (typeof WORKING_NOTES_ERROR_CODES)[number];

/**
 * Sentence case, no exclamation marks, and each one says what happened rather
 * than that something happened. None of these should be reachable from the UI
 * by an owner acting normally -- if one starts appearing, that is the finding.
 */
const MESSAGE: Record<WorkingNotesErrorCode, string> = {
  not_authenticated: 'Your session has expired. Sign in and try again.',
  invalid_source: 'That write came from somewhere this record does not accept.',
  not_a_member: 'You are not a member of this workspace.',
  entity_not_in_workspace: 'That contact belongs to a different workspace.',
  invalid_dnr_reason: 'That is not one of the do-not-rebook reasons.',
  invalid_preferred_channel: 'Preferred channel has to be call, email or SMS.',
  capture_cannot_write_private_note:
    'A capture cannot write a private note. Add it yourself on the contact.',
};

function isKnown(code: string): code is WorkingNotesErrorCode {
  return (WORKING_NOTES_ERROR_CODES as readonly string[]).includes(code);
}

/**
 * A sentence for a code.
 *
 * An unrecognised code keeps its own text rather than being flattened into
 * something generic -- a code this build has not heard of is worth seeing
 * verbatim in a log or a toast.
 */
export function workingNotesErrorMessage(code: string | null | undefined): string {
  if (!code) return 'Could not save. Nothing was changed.';
  return isKnown(code) ? MESSAGE[code] : `Could not save (${code}).`;
}

/**
 * Did the write actually change a row?
 *
 * PostgREST does not treat a zero-row UPDATE or DELETE as an error. A write
 * that matches nothing -- because RLS filtered every candidate row, or because
 * the filter named a column that holds something else -- comes back with
 * `error: null`, and an action that only checks `error` reports success.
 *
 * That is not a hypothetical. The workspace vocabulary picker shipped, showed
 * a success toast, and had never once written the setting; six more workspace
 * settings were doing the same thing beside it, and a workspace-creation
 * rollback was reporting that it had cleaned up after itself while leaving the
 * workspace in place.
 *
 * The database-side fix for each of those is its own policy or its own RPC.
 * This is the other half: chain `.select('id')` onto the write and pass the
 * result here, so that the next time a policy is missing the action says so
 * instead of lying.
 *
 * @module shared/lib/write-landed
 */
export type WriteResult<T> = { data: T[] | null; error: { message: string } | null };

export type Landed = { ok: true } | { ok: false; error: string };

/**
 * @param result   the awaited write, with `.select(...)` chained onto it
 * @param subject  what the caller was trying to change, for the message
 */
export function writeLanded<T>(result: WriteResult<T>, subject: string): Landed {
  if (result.error) return { ok: false, error: result.error.message };
  if (!result.data || result.data.length === 0) {
    // Deliberately not "try again". A retry cannot help -- nothing about the
    // request will be different the second time.
    return { ok: false, error: `Could not save ${subject}. Nothing was changed.` };
  }
  return { ok: true };
}

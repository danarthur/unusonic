/**
 * Limits on working notes — plain constants, no `'use server'`.
 *
 * `update-working-notes.ts` is a server-action module, and Next.js requires
 * every export from a 'use server' file to be a directly-defined async
 * function. A constant exported from there fails the build with "Server Actions
 * must be async functions" -- which `tsc` does not catch and only `next build`
 * does. It lives here so both the action and the card that enforces the limit
 * in the textarea can read the same number.
 *
 * @module widgets/network-detail/model/working-notes-limits
 */

/**
 * Longer than a communication style and shorter than a document.
 *
 * There is no CHECK on the column: a length limit is a product judgement, and
 * the place to change your mind about it is here rather than in a migration.
 */
export const PRIVATE_NOTES_MAX = 5000;

/** True when a patch's private notes exceed what the column should carry. */
export function privateNotesTooLong(notes: string | null | undefined): boolean {
  return typeof notes === 'string' && notes.length > PRIVATE_NOTES_MAX;
}

/**
 * JSONB payloads on their way to Postgres.
 *
 * The generated `Json` type is recursive and closed:
 * `string | number | boolean | null | Json[] | { [k: string]: Json | undefined }`.
 * A `Record<string, unknown>` is not assignable to it, which is correct --
 * `unknown` includes a Date, a Map, a class instance, a function, and none of
 * those survive the trip. supabase-js hands the payload to `JSON.stringify`,
 * so a Date arrives as a string, a Map arrives as `{}`, and a function
 * disappears. The type is telling you something true.
 *
 * `JsonObject` is the shape to build these payloads in, so the mistake is
 * caught where the object is written rather than where it is sent.
 *
 * @module shared/lib/jsonb
 */

import type { Json } from '@/types/supabase';

/** An object literal that is safe to send as JSONB. */
export type JsonObject = { [key: string]: Json | undefined };

/**
 * Assert that a value already known to be JSON-shaped is JSON-shaped.
 *
 * For the boundary where a payload arrives as `Record<string, unknown>` from a
 * caller this module does not own -- a parsed request body, a Zod output typed
 * loosely, an attributes bag read back from the database. Prefer `JsonObject`
 * at the point of construction; reach for this only when construction happens
 * somewhere you cannot change.
 */
export function asJsonb(value: Record<string, unknown>): Json {
  return value as Json;
}

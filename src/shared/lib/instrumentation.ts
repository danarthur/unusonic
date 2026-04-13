import * as Sentry from "@sentry/nextjs";

/**
 * Wrap a server action's body with Sentry instrumentation.
 * Usage inside a 'use server' function:
 *
 *   export async function myAction(id: string) {
 *     return instrument('myAction', async () => {
 *       // existing body
 *     });
 *   }
 *
 * Creates a performance span and auto-captures thrown errors.
 */
export async function instrument<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  return await Sentry.withServerActionInstrumentation(name, {}, fn);
}

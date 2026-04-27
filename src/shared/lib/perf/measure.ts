/**
 * Performance measurement primitives.
 *
 * Thin wrappers around the standard `performance.mark` / `performance.measure`
 * API plus a small in-memory ring of recent measurements that the dev overlay
 * (`<PerfOverlay>`) reads to display custom timings.
 *
 * Usage:
 *   import { markStart, markEnd } from '@/shared/lib/perf/measure';
 *
 *   markStart('crm:deal-switch');
 *   await loadDeal();
 *   markEnd('crm:deal-switch');  // logs to overlay + emits a `measure` entry
 *
 * Naming convention: `area:transition` (e.g. `crm:deal-switch`,
 * `aion:chat-send`, `proposal:builder-open`). The overlay groups by area
 * prefix so you can see all CRM measurements together.
 *
 * Production behaviour: marks are cheap (~1µs); we keep them on by default
 * so Sentry transaction traces include them. Only the visible overlay is
 * dev-gated.
 */

const MAX_RECENT = 50;
type RecentEntry = { name: string; durationMs: number; at: number };
const recent: RecentEntry[] = [];
const subscribers = new Set<(entries: RecentEntry[]) => void>();

function notify() {
  for (const fn of subscribers) fn([...recent]);
}

/** Begin a custom measurement. No-op on the server. */
export function markStart(name: string): void {
  if (typeof performance === 'undefined') return;
  try {
    performance.mark(`${name}:start`);
  } catch {
    /* mark name collision; ignore */
  }
}

/** Close a custom measurement started by `markStart(name)`. */
export function markEnd(name: string): void {
  if (typeof performance === 'undefined') return;
  try {
    performance.mark(`${name}:end`);
    const m = performance.measure(name, `${name}:start`, `${name}:end`);
    recent.push({ name, durationMs: m.duration, at: Date.now() });
    while (recent.length > MAX_RECENT) recent.shift();
    notify();
    // Clean up so subsequent calls with the same name don't conflict
    performance.clearMarks(`${name}:start`);
    performance.clearMarks(`${name}:end`);
    performance.clearMeasures(name);
  } catch {
    /* end without start — ignore silently */
  }
}

/**
 * Convenience: measure an async function call. Returns the function's
 * resolved value; the measurement is recorded under `name`.
 */
export async function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  markStart(name);
  try {
    return await fn();
  } finally {
    markEnd(name);
  }
}

/**
 * Subscribe to recent measurements. Used by the dev overlay to render a
 * live list. Returns an unsubscribe function.
 */
export function subscribeToMeasurements(
  fn: (entries: RecentEntry[]) => void,
): () => void {
  subscribers.add(fn);
  fn([...recent]);
  return () => {
    subscribers.delete(fn);
  };
}

/** Clear the in-memory ring. Used by the dev overlay's reset button. */
export function clearMeasurements(): void {
  recent.length = 0;
  notify();
}

export type PerfMeasurement = RecentEntry;

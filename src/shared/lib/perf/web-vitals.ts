/**
 * Web Vitals collector — reports Core Web Vitals (LCP, INP, CLS) plus FCP and
 * TTFB to Sentry as measurements and to a local ring buffer the dev overlay
 * reads.
 *
 * Loaded by `<PerfMeasurementBootstrap>` once at app start. Safe to import
 * anywhere — the actual reporting only fires on the client after first paint.
 *
 * Production: Sentry receives the metrics as transaction measurements so they
 * appear in the Performance dashboard.
 *
 * Dev: the overlay (`<PerfOverlay>`) shows them live so you can see the
 * effect of changes without leaving the page.
 */

import type { Metric } from 'web-vitals';

type VitalsEntry = {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  at: number;
};

const recent: VitalsEntry[] = [];
const subscribers = new Set<(entries: VitalsEntry[]) => void>();
let initialized = false;

function notify() {
  for (const fn of subscribers) fn([...recent]);
}

function recordMetric(metric: Metric) {
  recent.push({
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    at: Date.now(),
  });
  notify();
  // Forward to Sentry if available — this surfaces them on the Performance
  // dashboard alongside transaction traces.
  if (typeof window !== 'undefined') {
    const sentry = (window as Window & {
      Sentry?: { setMeasurement?: (n: string, v: number, u: string) => void };
    }).Sentry;
    sentry?.setMeasurement?.(
      metric.name.toLowerCase(),
      metric.value,
      metric.name === 'CLS' ? '' : 'millisecond',
    );
  }
}

/**
 * Idempotent. Safe to call from a `useEffect` in a client component.
 * Imports `web-vitals` dynamically so it's never in the server bundle.
 */
export async function bootstrapWebVitals(): Promise<void> {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const wv = await import('web-vitals');
  wv.onLCP(recordMetric);
  wv.onINP(recordMetric);
  wv.onCLS(recordMetric);
  wv.onFCP(recordMetric);
  wv.onTTFB(recordMetric);
}

/**
 * Subscribe to recent vitals entries. Returns an unsubscribe function.
 * The overlay uses this to render a live list.
 */
export function subscribeToVitals(
  fn: (entries: VitalsEntry[]) => void,
): () => void {
  subscribers.add(fn);
  fn([...recent]);
  return () => {
    subscribers.delete(fn);
  };
}

export type WebVitalEntry = VitalsEntry;

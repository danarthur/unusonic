/**
 * Pure filters over the metric registry. No I/O — the capability set is
 * passed in so this module is safe to import from server or client.
 *
 * Phase 2.3 "swap from library" consumes getVisibleLibrary(); the role-default
 * resolver consumes getRoleDefaults(). See the reports-and-analytics
 * implementation plan §2.1 for the contract.
 *
 * @module shared/lib/metrics/library
 */

import { METRICS } from './registry';
import type { MetricCapability, MetricDefinition, MetricRole } from './types';

/**
 * Returns every metric definition whose `requiredCapabilities` are all
 * satisfied by the supplied capability set. Entries with no required
 * capabilities always pass — the data fetcher or the downstream RLS is
 * responsible for any further scoping.
 */
export function getVisibleLibrary(
  userCaps: Set<MetricCapability>,
): MetricDefinition[] {
  return Object.values(METRICS).filter((m) =>
    m.requiredCapabilities.every((cap) => userCaps.has(cap)),
  );
}

/**
 * Returns the subset of the visible library that belongs to a persona's
 * default lobby layout. Composition: capability filter first, then
 * role intersect. This order guarantees we never surface a card the viewer
 * cannot see, even if the persona spec lists it.
 */
export function getRoleDefaults(
  userCaps: Set<MetricCapability>,
  persona: MetricRole,
): MetricDefinition[] {
  return getVisibleLibrary(userCaps).filter((m) => m.roles.includes(persona));
}

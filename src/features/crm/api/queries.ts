import { queryKeys } from "@/shared/api/query-keys";
import { getCrmGigs } from "@/app/(dashboard)/(features)/crm/actions/get-crm-gigs";
import {
  getPrismBundle,
  type PrismBundleSource,
} from "@/app/(dashboard)/(features)/crm/actions/get-prism-bundle";
import { getPlanBundle } from "@/app/(dashboard)/(features)/crm/actions/get-plan-bundle";

export const crmQueries = {
  gigs: (wsId: string) => ({
    queryKey: queryKeys.deals.all(wsId),
    queryFn: () => getCrmGigs(),
    staleTime: 30_000,
  }),

  /**
   * Prism detail bundle for a single selected deal/event. Cached per
   * (workspace, selectedId) so revisits are instant; staleTime keeps the
   * most-recently-viewed cards warm without hammering the server. Mutations
   * that change the bundle (status update, stakeholder change, handover)
   * must invalidate this key to keep the panel honest.
   */
  prismBundle: (
    wsId: string,
    selectedId: string,
    source: PrismBundleSource,
    sourceOrgId: string | null,
  ) => ({
    queryKey: [
      "crm",
      wsId,
      "prismBundle",
      selectedId,
      source,
      sourceOrgId,
    ] as const,
    queryFn: () => getPrismBundle(selectedId, source, sourceOrgId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  }),

  /**
   * Plan tab bundle. Same key shape as plan-lens.tsx's inline `useQuery`,
   * exposed here so production-grid-shell can warm-prefetch it on hover
   * after the prism bundle resolves (chained prefetch — prism gives us
   * the venue entity id needed for the plan bundle's venue intel slice).
   */
  planBundle: (
    eventScopedId: string | null,
    dealId: string | null,
    venueEntityId: string | null,
  ) => ({
    queryKey: [
      "plan-lens",
      "bundle",
      eventScopedId,
      dealId,
      venueEntityId,
    ] as const,
    queryFn: () => getPlanBundle(eventScopedId, dealId, venueEntityId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  }),
};

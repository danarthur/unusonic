'use server';

/**
 * getDealBundle — bundled fetch action for the deal-detail render path.
 *
 * The Prism deal panel needs three pieces of data when a deal opens or after
 * a stakeholder mutation: deal scalars, client context, stakeholders. Calling
 * three separate server actions costs three network round-trips from the
 * client (each one a fresh fetch + auth check + Supabase query). Bundling
 * them into one action collapses that to a single round-trip — the actual
 * Supabase queries still parallelize on the server via Promise.all.
 *
 * This is A4 of the platform perf plan: the canonical pattern for "fetches
 * always made together." Future detail pages (event lens, network entity
 * sheet) should use the same shape.
 *
 * Pattern:
 *   - Bundle action lives alongside the individual actions
 *   - Returns a single object with all three resources
 *   - Internal Promise.all so server-side latency is the max of the three,
 *     not their sum
 *   - Each individual action is preserved (callers that genuinely need just
 *     one field — e.g. background refresh after a focus event — still use them)
 *
 * Used by:
 *   - prism.tsx initial deal load (Promise.all → bundle call)
 *   - prism.tsx refetchDealAndClient (3 calls → bundle call)
 */

import { getDeal, type DealDetail } from './get-deal';
import { getDealClientContext, type DealClientContext } from './get-deal-client';
import { getDealStakeholders, type DealStakeholderDisplay } from './deal-stakeholders';

export type DealBundle = {
  deal: DealDetail | null;
  client: DealClientContext | null;
  stakeholders: DealStakeholderDisplay[];
};

export async function getDealBundle(
  dealId: string,
  sourceOrgId: string | null,
): Promise<DealBundle> {
  const [deal, client, stakeholders] = await Promise.all([
    getDeal(dealId),
    getDealClientContext(dealId, sourceOrgId),
    getDealStakeholders(dealId),
  ]);
  return {
    deal: deal ?? null,
    client: client ?? null,
    stakeholders: stakeholders ?? [],
  };
}

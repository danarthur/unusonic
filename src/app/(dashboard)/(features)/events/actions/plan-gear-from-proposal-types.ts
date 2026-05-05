/**
 * plan-gear-from-proposal-types.ts — types only, no `'use server'`.
 *
 * The sibling `plan-gear-from-proposal.ts` is a server action module, and
 * Next.js requires every export from a 'use server' file to be a directly-
 * defined async function. Type exports trigger a runtime ReferenceError
 * because the type names get name-shaken into the server-action wire format
 * and end up as undefined values. Keeping the public types here, in a
 * regular module, sidesteps that constraint.
 *
 * See proposal-gear-lineage-plan-2026-04-29.md §5 for the role of each shape.
 */

export type ProposalGearChild = {
  proposalItemId: string;
  catalogPackageId: string;
  name: string;
  quantity: number;
  isSubRental: boolean;
  department: string | null;
};

export type ProposalGearBundle = {
  kind: 'bundle';
  headerProposalItemId: string;
  packageInstanceId: string;
  catalogPackageId: string;
  packageName: string;
  packageSnapshot: Record<string, unknown>;
  decomposed: boolean;
  headerQuantity: number;
  /** Used when decomposed=false — the bundle becomes one gear row. */
  wholeRowMeta: { isSubRental: boolean; department: string | null };
  /** Populated when decomposed=true — one entry per rental ingredient. */
  children: ProposalGearChild[];
};

export type ProposalGearStandalone = {
  kind: 'standalone';
  proposalItemId: string;
  catalogPackageId: string;
  name: string;
  quantity: number;
  isSubRental: boolean;
  department: string | null;
};

/**
 * A service line on the proposal (DJ, photo booth, MC, etc.). Phase 2e
 * surfaces these as top-level parent gear rows so a PM can later attach the
 * assigned crew member's verified kit (Phase 5b). Lives at the top level —
 * never nested inside a bundle — so the bundle's children stay restricted to
 * actual gear and the service has space for its own kit children.
 *
 * `packageInstanceId` is non-null when the service was sold inside a bundle
 * (preserves the relationship for Aion + drift detection); null for
 * standalone service lines.
 */
export type ProposalGearService = {
  kind: 'service';
  proposalItemId: string;
  catalogPackageId: string;
  serviceName: string;
  packageSnapshot: Record<string, unknown>;
  quantity: number;
  packageInstanceId: string | null;
};

export type ProposalGearPlanItem = ProposalGearBundle | ProposalGearStandalone | ProposalGearService;

export type ProposalGearPlan = {
  proposalId: string;
  items: ProposalGearPlanItem[];
};

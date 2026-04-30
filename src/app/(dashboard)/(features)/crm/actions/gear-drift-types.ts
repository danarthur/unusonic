/**
 * gear-drift-types.ts — types only, no `'use server'`.
 *
 * Mirrors the plan-gear-from-proposal-types pattern: Next.js 'use server'
 * modules cannot export type names without triggering a runtime
 * ReferenceError, so the public types live here.
 *
 * See proposal-gear-lineage-plan-2026-04-29.md §5 Phase 3 for the role of
 * each shape.
 */

/** A proposal_item that should produce gear but doesn't have a row yet. */
export type DriftAdd = {
  kind: 'add';
  proposalItemId: string;
  /** Pinned at compute time so dismissal can compare apples to apples. */
  proposalItemUpdatedAt: string;
  name: string;
  expectedQuantity: number;
  /**
   * `bundle_header` = a package's header (would create parent + children),
   * `bundle_child` = a single child under an existing bundle parent,
   * `standalone` = a one-row standalone rental,
   * `service` = a service parent (DJ etc.).
   */
  shape: 'bundle_header' | 'bundle_child' | 'standalone' | 'service';
};

/** A gear row whose proposal_item is gone — either deleted (FK SET NULL) or
 * the plan no longer includes it (e.g. catalog category flipped). */
export type DriftRemove = {
  kind: 'remove';
  gearItemId: string;
  /** May be NULL when FK SET NULL has fired (proposal_item deleted). */
  proposalItemId: string | null;
  /** Used by dismiss when proposalItemId is non-null; ignored otherwise. */
  proposalItemUpdatedAt: string | null;
  name: string;
  quantity: number;
};

/** Quantity diverged between the proposal and the gear card. */
export type DriftQtyChange = {
  kind: 'qty_change';
  gearItemId: string;
  proposalItemId: string;
  proposalItemUpdatedAt: string;
  name: string;
  oldQuantity: number;
  newQuantity: number;
};

export type GearDrift = DriftAdd | DriftRemove | DriftQtyChange;

export type GearDriftReport = {
  drifts: GearDrift[];
  /** Most recent updated_at across all proposal_items. Banner timestamp. */
  proposalLastChangedAt: string | null;
  /** Used by accept actions to re-run the plan. */
  proposalId: string | null;
};

export type DriftMutationResult =
  | { success: true }
  | { success: false; error: string };

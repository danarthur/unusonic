/**
 * gear-drift-helpers.ts — pure functions for drift compute. No 'use server'.
 *
 * Lifted out of gear-drift.ts so the action module stays under the file-size
 * cap and the comparison logic is testable in isolation. See
 * proposal-gear-lineage-plan-2026-04-29.md §5 Phase 3 for the spec.
 */

import type {
  ProposalGearBundle,
  ProposalGearPlan,
} from './plan-gear-from-proposal-types';
import type { GearDrift } from './gear-drift-types';

export type GearRow = {
  id: string;
  proposal_item_id: string | null;
  parent_gear_item_id: string | null;
  quantity: number;
  lineage_source: 'proposal' | 'pm_added' | 'pm_swapped' | 'pm_detached' | 'kit_materialized';
  name: string;
  is_package_parent: boolean;
  package_instance_id: string | null;
};

export type ExpectedEntry = {
  proposalItemId: string;
  expectedQuantity: number;
  name: string;
  shape: 'bundle_header' | 'bundle_child' | 'standalone' | 'service';
};

export function buildExpected(plan: ProposalGearPlan): Map<string, ExpectedEntry> {
  const out = new Map<string, ExpectedEntry>();
  for (const item of plan.items) {
    if (item.kind === 'standalone') {
      out.set(item.proposalItemId, {
        proposalItemId: item.proposalItemId,
        expectedQuantity: item.quantity,
        name: item.name,
        shape: 'standalone',
      });
    } else if (item.kind === 'service') {
      out.set(item.proposalItemId, {
        proposalItemId: item.proposalItemId,
        expectedQuantity: item.quantity,
        name: item.serviceName,
        shape: 'service',
      });
    } else {
      const bundle = item as ProposalGearBundle;
      out.set(bundle.headerProposalItemId, {
        proposalItemId: bundle.headerProposalItemId,
        expectedQuantity: bundle.headerQuantity,
        name: bundle.packageName,
        shape: 'bundle_header',
      });
      if (bundle.decomposed) {
        for (const child of bundle.children) {
          out.set(child.proposalItemId, {
            proposalItemId: child.proposalItemId,
            expectedQuantity: child.quantity,
            name: child.name,
            shape: 'bundle_child',
          });
        }
      }
    }
  }
  return out;
}

export function buildExisting(rows: GearRow[]): Map<string, GearRow> {
  const out = new Map<string, GearRow>();
  for (const row of rows) {
    if (row.lineage_source === 'pm_detached') continue;
    if (row.lineage_source === 'pm_added') continue;
    if (row.lineage_source === 'kit_materialized') continue;
    if (!row.proposal_item_id) continue;
    out.set(row.proposal_item_id, row);
  }
  return out;
}

export function isDismissed(
  proposalItemId: string,
  proposalUpdatedAt: string,
  dismissals: Map<string, string>,
): boolean {
  const dismissedAt = dismissals.get(proposalItemId);
  return !!dismissedAt && dismissedAt >= proposalUpdatedAt;
}

export function computeAddsAndQtyDrifts(
  expected: Map<string, ExpectedEntry>,
  existing: Map<string, GearRow>,
  updatedAt: Map<string, string>,
  dismissals: Map<string, string>,
): GearDrift[] {
  const drifts: GearDrift[] = [];
  for (const [propId, exp] of expected) {
    const ts = updatedAt.get(propId);
    if (!ts) continue;
    if (isDismissed(propId, ts, dismissals)) continue;

    const gear = existing.get(propId);
    if (!gear) {
      drifts.push({
        kind: 'add',
        proposalItemId: propId,
        proposalItemUpdatedAt: ts,
        name: exp.name,
        expectedQuantity: exp.expectedQuantity,
        shape: exp.shape,
      });
    } else if (gear.quantity !== exp.expectedQuantity) {
      drifts.push({
        kind: 'qty_change',
        gearItemId: gear.id,
        proposalItemId: propId,
        proposalItemUpdatedAt: ts,
        name: exp.name,
        oldQuantity: gear.quantity,
        newQuantity: exp.expectedQuantity,
      });
    }
  }
  return drifts;
}

export function computeRemoves(
  rows: GearRow[],
  expected: Map<string, ExpectedEntry>,
  updatedAt: Map<string, string>,
  dismissals: Map<string, string>,
): GearDrift[] {
  const drifts: GearDrift[] = [];
  for (const row of rows) {
    if (row.lineage_source !== 'proposal' && row.lineage_source !== 'pm_swapped') continue;
    if (row.proposal_item_id && expected.has(row.proposal_item_id)) continue;

    const ts = row.proposal_item_id ? updatedAt.get(row.proposal_item_id) ?? null : null;
    if (row.proposal_item_id && ts && isDismissed(row.proposal_item_id, ts, dismissals)) continue;

    drifts.push({
      kind: 'remove',
      gearItemId: row.id,
      proposalItemId: row.proposal_item_id,
      proposalItemUpdatedAt: ts,
      name: row.name,
      quantity: row.quantity,
    });
  }
  return drifts;
}

export function latestUpdatedAt(updatedAt: Map<string, string>): string | null {
  let latest: string | null = null;
  for (const ts of updatedAt.values()) {
    if (!latest || ts > latest) latest = ts;
  }
  return latest;
}

export function indexUpdatedAt(rows: { id: string; updated_at: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) out.set(r.id, r.updated_at);
  return out;
}

export function indexDismissals(rows: { proposal_item_id: string; proposal_item_updated_at: string }[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of rows) {
    const prior = out.get(d.proposal_item_id);
    if (!prior || d.proposal_item_updated_at > prior) {
      out.set(d.proposal_item_id, d.proposal_item_updated_at);
    }
  }
  return out;
}

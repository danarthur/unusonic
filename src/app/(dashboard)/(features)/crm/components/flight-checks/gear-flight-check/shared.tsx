'use client';

/**
 * GearFlightCheck — shared helpers, types, and chip-style constants.
 *
 * Imported by the main GearFlightCheck.tsx orchestrator and its sibling
 * sub-components (DepartmentSection, GearItemRow, OperatorPicker). Lives
 * here to break circular imports and centralise the lifecycle/source
 * helpers without polluting the flight-checks/ flat namespace.
 */

import type { EventGearItem, GearSource } from '../../../actions/event-gear-items';
import { GEAR_BRANCH_STATES, GEAR_LIFECYCLE_ORDER, type GearStatus } from '../types';

export function getLifecycleIndex(status: GearStatus): number {
  return GEAR_LIFECYCLE_ORDER.indexOf(status);
}

export function isBranchState(status: GearStatus): boolean {
  return GEAR_BRANCH_STATES.includes(status);
}

export function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export type DepartmentGearGroup = {
  department: string;
  items: EventGearItem[];
};

export const SOURCE_CHIP_STYLES: Record<GearSource, { bg: string; text: string; label: string }> = {
  company: { bg: 'bg-[oklch(1_0_0/0.06)]', text: 'text-[var(--stage-text-tertiary)]', label: 'Company' },
  crew: { bg: 'bg-[oklch(0.75_0.15_240_/_0.15)]', text: 'text-[var(--color-unusonic-info)]', label: 'Crew' },
  subrental: { bg: 'bg-[var(--color-unusonic-warning)]/15', text: 'text-[var(--color-unusonic-warning)]', label: 'Sub-rental' },
};

// =============================================================================
// Lineage tree assembly (proposal-gear-lineage-plan §5 Phase 2b)
// =============================================================================

/**
 * Top-level node on the gear card when lineage view is on. A `parent` node
 * carries its children inline (rendered nested under a collapsible header);
 * a `loose` node is a standalone row (no parent/child structure).
 */
export type LineageNode =
  | { kind: 'parent'; row: EventGearItem; children: EventGearItem[]; effectiveDepartment: string | null }
  | { kind: 'loose'; row: EventGearItem };

/**
 * Builds a lineage-aware view of flat gear rows. Children of package parents
 * are nested under their parent (and removed from the top-level list). The
 * parent's `effectiveDepartment` is borrowed from its first non-null child so
 * department grouping places it sensibly even though parent rows themselves
 * have NULL department.
 */
export function buildLineageNodes(items: EventGearItem[]): LineageNode[] {
  const childrenByParent = new Map<string, EventGearItem[]>();
  for (const item of items) {
    if (item.parent_gear_item_id) {
      const list = childrenByParent.get(item.parent_gear_item_id) ?? [];
      list.push(item);
      childrenByParent.set(item.parent_gear_item_id, list);
    }
  }

  const nodes: LineageNode[] = [];
  for (const item of items) {
    if (item.parent_gear_item_id) continue; // rendered under its parent
    if (item.is_package_parent) {
      const children = childrenByParent.get(item.id) ?? [];
      const effective = children.find((c) => c.department)?.department ?? item.department ?? null;
      nodes.push({ kind: 'parent', row: item, children, effectiveDepartment: effective });
    } else {
      nodes.push({ kind: 'loose', row: item });
    }
  }
  return nodes;
}

/** Department key for a node — drives department grouping. */
export function nodeDepartment(node: LineageNode): string | null {
  return node.kind === 'parent' ? node.effectiveDepartment : node.row.department;
}

// =============================================================================
// Lineage chip styling (proposal-gear-lineage-plan §6.1/6.2)
// =============================================================================

export type LineageChip = { label: string; bg: string; text: string; tooltip?: string };

/**
 * Resolves the lineage chip shown on a gear row. Returns null for
 * `lineage_source='proposal'` — that's the default state for synced rows,
 * and flagging it on every row crowds the layout without adding signal. The
 * chip only appears when something noteworthy has happened (PM added, swapped,
 * or detached). The parent row's package label already tells the user the
 * row's package context.
 *
 * `kit_materialized` rows (Phase 5b) are also default-quiet — they sit under
 * a service parent whose name + crew chip already names the source.
 */
export function lineageChipFor(item: EventGearItem): LineageChip | null {
  switch (item.lineage_source) {
    case 'proposal':
    case 'kit_materialized':
      return null;
    case 'pm_added':
      return {
        label: 'PM added',
        bg: 'bg-[oklch(1_0_0/0.04)]',
        text: 'text-[var(--stage-text-tertiary)]',
        tooltip: 'Added manually after handoff — not on the proposal.',
      };
    case 'pm_swapped':
      return {
        label: 'Swapped',
        bg: 'bg-[var(--color-unusonic-info)]/12',
        text: 'text-[var(--color-unusonic-info)]',
        tooltip: 'Substituted from a different catalog item; lineage to the proposal preserved.',
      };
    case 'pm_detached':
      return {
        label: 'Detached',
        bg: 'bg-[var(--color-unusonic-warning)]/12',
        text: 'text-[var(--color-unusonic-warning)]',
        tooltip: 'Removed from its package on the gear card; still tied to the proposal line.',
      };
    default:
      return null;
  }
}

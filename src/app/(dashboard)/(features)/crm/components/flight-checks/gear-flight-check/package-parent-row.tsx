'use client';

/**
 * PackageParentRow — renders a bundle's package header on the gear card.
 *
 * Phase 2b of the proposal→gear lineage plan. The parent row is a collapsible
 * group: chevron + package name + status rollup + "From proposal" chip. Its
 * children render nested underneath when expanded. This is the affordance the
 * Field Expert flagged as the unsolved category-wide problem
 * (Linear parentId / Figma main-instance / manufacturing phantom BOM).
 *
 * Pure props — collapse state lives in the GearFlightCheck orchestrator.
 */

import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import type { EventGearItem } from '../../../actions/event-gear-items';
import { GEAR_LIFECYCLE_ORDER } from '../types';
import { getLifecycleIndex, isBranchState } from './shared';

export type PackageParentRowProps = {
  parent: EventGearItem;
  childItems: EventGearItem[];
  collapsed: boolean;
  onToggle: () => void;
};

type Rollup = { label: string; tone: 'progress' | 'success' | 'tertiary' };

function rollupForChildren(items: EventGearItem[]): Rollup {
  if (items.length === 0) return { label: 'No items', tone: 'tertiary' };

  const linear = items.filter((c) => !isBranchState(c.status));
  if (linear.length === 0) {
    return { label: `${items.length} flagged`, tone: 'tertiary' };
  }

  const returned = linear.filter((c) => c.status === 'returned');
  if (returned.length === linear.length) {
    return { label: `${returned.length} of ${linear.length} returned`, tone: 'success' };
  }

  const loadedIndex = GEAR_LIFECYCLE_ORDER.indexOf('loaded');
  const loadedOrBeyond = linear.filter((c) => getLifecycleIndex(c.status) >= loadedIndex);
  return {
    label: `${loadedOrBeyond.length} of ${linear.length} loaded`,
    tone: loadedOrBeyond.length === linear.length ? 'success' : 'progress',
  };
}

const TONE_CLASSES: Record<Rollup['tone'], string> = {
  success: 'text-[var(--color-unusonic-success)]',
  progress: 'text-[var(--stage-text-secondary)]',
  tertiary: 'text-[var(--stage-text-tertiary)]',
};

export function PackageParentRow({ parent, childItems, collapsed, onToggle }: PackageParentRowProps) {
  const rollup = rollupForChildren(childItems);
  const toneClass = TONE_CLASSES[rollup.tone];

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2.5 py-2 border-b border-[oklch(1_0_0_/_0.05)] last:border-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-sm"
      aria-expanded={!collapsed}
    >
      <span className="shrink-0 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-secondary)] transition-colors">
        {collapsed ? (
          <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
        ) : (
          <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
        )}
      </span>
      <Package size={14} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
      <span className="min-w-0 flex-1 text-left">
        <span className="stage-readout truncate font-medium">{parent.name}</span>
        {childItems.length > 0 && (
          <span className="ml-2 text-label tabular-nums text-[var(--stage-text-tertiary)]">
            {childItems.length} item{childItems.length === 1 ? '' : 's'}
          </span>
        )}
      </span>
      <span className={`shrink-0 text-label tabular-nums ${toneClass}`}>{rollup.label}</span>
      <span className="shrink-0 stage-badge-text tracking-tight px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.04)] text-[var(--stage-text-tertiary)]">
        From proposal
      </span>
    </button>
  );
}

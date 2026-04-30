'use client';

/**
 * PackageParentRow — renders a parent row on the gear card. Two flavors:
 *
 *   - Package parent (Phase 2b): a bundle decomposing into rental children.
 *     Icon: Package. No action button.
 *   - Service parent (Phase 2e): a service line (DJ, photo booth, MC) that
 *     can have a crew member's verified kit materialized as children.
 *     Icon: User. Right-side "Sync kit" action when onSyncKit is provided.
 *
 * Distinguishing flavor comes from `parent.package_snapshot.category` —
 * 'service' for service parents, 'package' for bundle parents.
 *
 * Pure props — collapse + sync-kit picker state live in the GearFlightCheck
 * orchestrator.
 */

import { ChevronDown, ChevronRight, Package, User } from 'lucide-react';
import type { EventGearItem } from '../../../actions/event-gear-items';
import { GEAR_LIFECYCLE_ORDER } from '../types';
import { getLifecycleIndex, isBranchState } from './shared';

export type PackageParentRowProps = {
  parent: EventGearItem;
  childItems: EventGearItem[];
  collapsed: boolean;
  onToggle: () => void;
  /**
   * When defined, a "Sync kit" button appears on service parents and clicking
   * it opens the crew picker. Undefined on package parents (different
   * decomposition path) or when no eligible crew exists.
   */
  onSyncKit?: () => void;
};

type Rollup = { label: string; tone: 'progress' | 'success' | 'tertiary' };

function rollupForChildren(items: EventGearItem[], isService: boolean): Rollup {
  if (items.length === 0) {
    return {
      label: isService ? 'No equipment yet' : 'No items',
      tone: 'tertiary',
    };
  }

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

function isServiceParent(parent: EventGearItem): boolean {
  const snap = parent.package_snapshot as { category?: string } | null;
  return snap?.category === 'service';
}

export function PackageParentRow({ parent, childItems, collapsed, onToggle, onSyncKit }: PackageParentRowProps) {
  const isService = isServiceParent(parent);
  const rollup = rollupForChildren(childItems, isService);
  const toneClass = TONE_CLASSES[rollup.tone];
  const Icon = isService ? User : Package;

  return (
    <div className="flex items-center gap-2 px-2 -mx-2 rounded-[6px] border-b border-[oklch(1_0_0_/_0.05)] last:border-0 hover:bg-[oklch(1_0_0/0.04)] transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="flex-1 min-w-0 flex items-center gap-2.5 py-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-sm"
        aria-expanded={!collapsed}
      >
        <span className="shrink-0 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-secondary)] transition-colors">
          {collapsed ? (
            <ChevronRight size={14} strokeWidth={1.5} aria-hidden />
          ) : (
            <ChevronDown size={14} strokeWidth={1.5} aria-hidden />
          )}
        </span>
        <Icon size={14} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
        <span className="min-w-0 flex-1 text-left">
          <span className="stage-readout truncate font-medium">{parent.name}</span>
          {childItems.length > 0 && (
            <span className="ml-2 text-label tabular-nums text-[var(--stage-text-tertiary)]">
              {childItems.length} item{childItems.length === 1 ? '' : 's'}
            </span>
          )}
        </span>
        <span className={`shrink-0 text-label tabular-nums ${toneClass}`}>{rollup.label}</span>
      </button>
      {isService && onSyncKit && (
        <button
          type="button"
          onClick={onSyncKit}
          className="shrink-0 mr-1 stage-badge-text tracking-tight px-2 py-1 rounded-full bg-[oklch(0.75_0.15_240_/_0.15)] text-[var(--color-unusonic-info)] hover:bg-[oklch(0.75_0.15_240_/_0.25)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          title="Materialize the assigned crew member's verified kit as children of this service."
        >
          Sync kit
        </button>
      )}
    </div>
  );
}

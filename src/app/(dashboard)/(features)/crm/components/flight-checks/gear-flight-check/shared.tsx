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

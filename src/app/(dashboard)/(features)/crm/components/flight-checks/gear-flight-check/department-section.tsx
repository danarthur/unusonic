'use client';

/**
 * DepartmentSection — collapsible group header + list of GearItemRows for a
 * single department within GearFlightCheck. Aggregates kit-compliance for
 * the assigned crew and renders the department's avatar stack inline.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type {
  CrewGearMatch,
  EventGearItem,
  GearAvailability,
} from '../../../actions/event-gear-items';
import type { DealCrewRow } from '../../../actions/deal-crew';
import type { KitComplianceResult } from '@/features/talent-management/api/kit-template-actions';
import type { GearStatus } from '../types';
import { GearItemRow } from './gear-item-row';
import { type DepartmentGearGroup, getInitials, getLifecycleIndex, isBranchState } from './shared';

type DepartmentSectionProps = {
  group: DepartmentGearGroup;
  collapsed: boolean;
  onToggle: () => void;
  deptCrew: DealCrewRow[];
  kitCompliance: Record<string, KitComplianceResult>;
  updating: string | null;
  menuOpen: string | null;
  availability: Map<string, GearAvailability>;
  operatorPickerOpen: string | null;
  crewRows: DealCrewRow[];
  crewMatches: Record<string, CrewGearMatch[]>;
  sourcing: string | null;
  onSourceFromCrew: (itemId: string, entityId: string) => void;
  onAdvance: (id: string) => void;
  onSetStatus: (id: string, s: GearStatus) => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  onOpenOperatorPicker: (id: string) => void;
  onAssignOperator: (itemId: string, entityId: string | null) => void;
  onOpenCrewDetail?: (row: DealCrewRow) => void;
};

export function DepartmentSection({
  group,
  collapsed,
  onToggle,
  deptCrew,
  kitCompliance,
  updating,
  menuOpen,
  availability,
  operatorPickerOpen,
  crewRows,
  crewMatches,
  sourcing,
  onSourceFromCrew,
  onAdvance,
  onSetStatus,
  onToggleMenu,
  onCloseMenu,
  onOpenOperatorPicker,
  onAssignOperator,
  onOpenCrewDetail,
}: DepartmentSectionProps) {
  const { department, items } = group;
  const loadedCount = items.filter(
    (i: EventGearItem) => !isBranchState(i.status) && getLifecycleIndex(i.status) >= 3,
  ).length;

  // Aggregate kit compliance across everyone in this department who has a
  // kit-template-backed role. Skipped entirely when nobody on this dept has
  // kit expectations — avoids showing a 0/0 pill for untracked roles.
  const kitAgg = deptCrew.reduce(
    (acc, c) => {
      const r = c.entity_id ? kitCompliance[c.entity_id] : undefined;
      if (!r || r.total === 0) return acc;
      return { matched: acc.matched + r.matched, total: acc.total + r.total };
    },
    { matched: 0, total: 0 },
  );
  const kitComplete = kitAgg.total > 0 && kitAgg.matched === kitAgg.total;

  return (
    <div className="border-b border-[oklch(1_0_0_/_0.06)] last:border-0">
      {/* Department header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2.5 px-1 group focus:outline-none"
      >
        <motion.div
          animate={{ rotate: collapsed ? -90 : 0 }}
          transition={STAGE_LIGHT}
          className="shrink-0"
        >
          <ChevronDown className="size-3 text-[var(--stage-text-tertiary)] group-hover:text-[var(--stage-text-secondary)] transition-colors" />
        </motion.div>
        <span className="stage-label tracking-tight">
          {department}
        </span>
        <span className="text-label text-[var(--stage-text-tertiary)] tabular-nums">
          {items.length}
        </span>

        {/* Crew avatars for this department */}
        {deptCrew.length > 0 && (
          <div className="flex items-center -space-x-1 ml-1">
            {deptCrew.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="size-5 rounded-full bg-[oklch(1_0_0_/_0.08)] border border-[oklch(1_0_0_/_0.12)] flex items-center justify-center"
                title={c.entity_name ?? c.role_note ?? undefined}
              >
                <span className="text-micro font-medium text-[var(--stage-text-tertiary)]">
                  {getInitials(c.entity_name)}
                </span>
              </div>
            ))}
            {deptCrew.length > 3 && (
              <span className="text-micro text-[var(--stage-text-tertiary)] ml-1.5 tabular-nums">
                +{deptCrew.length - 3}
              </span>
            )}
          </div>
        )}

        <span className="flex-1" />
        {kitAgg.total > 0 && (
          <span
            className="shrink-0 stage-badge-text tabular-nums tracking-tight px-1.5 py-0.5 rounded-md mr-2"
            style={{
              color: kitComplete
                ? 'var(--color-unusonic-success)'
                : 'var(--color-unusonic-warning)',
              background: kitComplete
                ? 'color-mix(in oklch, var(--color-unusonic-success) 12%, transparent)'
                : 'color-mix(in oklch, var(--color-unusonic-warning) 12%, transparent)',
            }}
            title={
              kitComplete
                ? 'Crew kit complete for this department'
                : `${kitAgg.total - kitAgg.matched} kit item(s) missing across ${department} crew`
            }
          >
            {kitAgg.matched}/{kitAgg.total} kit
          </span>
        )}
        <span className="text-label text-[var(--stage-text-tertiary)] tracking-tight tabular-nums">
          {loadedCount}/{items.length} loaded
        </span>
      </button>

      {/* Collapsible content */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <ul className="pb-2 pl-1 space-y-1">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={STAGE_LIGHT}
                    className="overflow-hidden"
                  >
                    <GearItemRow
                      item={item}
                      updating={updating === item.id}
                      menuOpen={menuOpen === item.id}
                      availability={item.catalog_package_id ? availability.get(item.catalog_package_id) : undefined}
                      operatorPickerOpen={operatorPickerOpen === item.id}
                      crewRows={crewRows}
                      crewMatchesForItem={crewMatches[item.id]}
                      sourcingItem={sourcing === item.id}
                      onSourceFromCrew={(entityId) => onSourceFromCrew(item.id, entityId)}
                      onAdvance={() => onAdvance(item.id)}
                      onSetStatus={(s) => onSetStatus(item.id, s)}
                      onToggleMenu={() => onToggleMenu(item.id)}
                      onCloseMenu={onCloseMenu}
                      onOpenOperatorPicker={() => onOpenOperatorPicker(item.id)}
                      onAssignOperator={(entityId) => onAssignOperator(item.id, entityId)}
                      onOpenCrewDetail={onOpenCrewDetail}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

/**
 * GearItemRow — single gear-item row within a GearFlightCheck section.
 *
 * Owns: lifecycle dot track, source chip / crew-match nudge, operator-avatar
 * picker, status advance button, branch-state more-menu (portaled), and the
 * inline OperatorPicker collapse. Pure props — all state lives in the parent
 * orchestrator (GearFlightCheck.tsx).
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MoreVertical, User } from 'lucide-react';
import { createPortal } from 'react-dom';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type {
  CrewGearMatch,
  EventGearItem,
  GearAvailability,
} from '../../../actions/event-gear-items';
import type { DealCrewRow } from '../../../actions/deal-crew';
import { DEFAULT_DEPARTMENT } from '../../../lib/department-mapping';
import { GEAR_LIFECYCLE_ORDER, GEAR_STATUS_LABELS, type GearStatus } from '../types';
import { OperatorPicker } from './operator-picker';
import { SOURCE_CHIP_STYLES, getInitials, getLifecycleIndex, isBranchState, lineageChipFor } from './shared';

type RowMenuContentProps = {
  isBranch: boolean;
  canDetach: boolean;
  onSetStatus: (s: GearStatus) => void;
  onCloseMenu: () => void;
  onDetach?: () => void;
};

function RowMenuContent({ isBranch, canDetach, onSetStatus, onCloseMenu, onDetach }: RowMenuContentProps) {
  if (isBranch) {
    return (
      <button
        type="button"
        onClick={() => onSetStatus('allocated')}
        className="w-full text-left px-3 py-1.5 text-xs text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors"
      >
        Return to allocated
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => onSetStatus('quarantine')}
        className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-unusonic-error)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors"
      >
        Quarantine
      </button>
      <button
        type="button"
        onClick={() => onSetStatus('sub_rented')}
        className="w-full text-left px-3 py-1.5 text-xs text-[var(--color-unusonic-warning)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors"
      >
        Sub-rented
      </button>
      {canDetach && (
        <button
          type="button"
          onClick={() => {
            onCloseMenu();
            onDetach?.();
          }}
          className="w-full text-left px-3 py-1.5 text-xs text-[var(--stage-text-secondary)] border-t border-[oklch(1_0_0/0.06)] hover:bg-[oklch(1_0_0_/_0.06)] hover:text-[var(--stage-text-primary)] transition-colors"
          title="Remove this row from its package on the gear card. Lineage to the proposal is preserved."
        >
          Detach from package
        </button>
      )}
    </>
  );
}

export type GearItemRowProps = {
  item: EventGearItem;
  updating: boolean;
  menuOpen: boolean;
  availability?: GearAvailability;
  operatorPickerOpen: boolean;
  crewRows: DealCrewRow[];
  crewMatchesForItem?: CrewGearMatch[];
  sourcingItem: boolean;
  onSourceFromCrew: (entityId: string) => void;
  onAdvance: () => void;
  onSetStatus: (s: GearStatus) => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpenOperatorPicker: () => void;
  onAssignOperator: (entityId: string | null) => void;
  onOpenCrewDetail?: (row: DealCrewRow) => void;
  /** Phase 2b lineage view: render lineage chip + indent for children. */
  lineageEnabled?: boolean;
  /** Phase 2b lineage view: indent children under their package parent. */
  indented?: boolean;
  /** Phase 2b lineage view: handler for "Detach from package" — only shown when defined and the row has a parent. */
  onDetach?: () => void;
};

export function GearItemRow({
  item,
  updating,
  menuOpen,
  availability,
  operatorPickerOpen,
  crewRows,
  crewMatchesForItem,
  sourcingItem,
  onSourceFromCrew,
  onAdvance,
  onSetStatus,
  onToggleMenu,
  onCloseMenu,
  onOpenOperatorPicker,
  onAssignOperator,
  onOpenCrewDetail,
  lineageEnabled = false,
  indented = false,
  onDetach,
}: GearItemRowProps) {
  const isBranch = isBranchState(item.status);
  const lineageChip = lineageEnabled ? lineageChipFor(item) : null;
  const canDetach = lineageEnabled && !!onDetach && item.parent_gear_item_id !== null;
  const lifecycleIdx = isBranch ? -1 : getLifecycleIndex(item.status);
  const isTerminal = item.status === 'returned';
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Find the assigned operator name from crewRows
  const operatorCrew = item.operator_entity_id
    ? crewRows.find((c) => c.entity_id === item.operator_entity_id)
    : null;

  // Crew in same department for the operator picker
  const deptCrew = crewRows.filter(
    (c) => c.entity_id && (c.department === item.department || (!c.department && (item.department ?? DEFAULT_DEPARTMENT) === DEFAULT_DEPARTMENT)),
  );

  // Position menu when opened
  useEffect(() => {
    if (menuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.right - 140 });
    }
  }, [menuOpen]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        onCloseMenu();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen, onCloseMenu]);

  return (
    <div>
      <div
        className={`flex items-center gap-3 py-2 px-2 -mx-2 rounded-[6px] border-b border-[oklch(1_0_0_/_0.05)] last:border-0 hover:bg-[oklch(1_0_0/0.03)] transition-colors ${isBranch ? 'text-[var(--stage-text-secondary)]' : ''} ${indented ? 'pl-6' : ''}`}
      >
        {/* Name + quantity */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="stage-readout truncate">
            {item.name}
          </span>
          {item.quantity > 1 && (
            <span className="shrink-0 text-label tabular-nums text-[var(--stage-text-tertiary)] bg-[oklch(1_0_0_/_0.06)] px-1.5 py-0.5 rounded-full">
              x{item.quantity}
            </span>
          )}
        </div>

        {/* Availability badge — drops " avail" suffix to claw back ~30px;
            full text lives in the title on hover. */}
        {availability && availability.stockQuantity !== null && (
          <span
            className={`shrink-0 text-label tabular-nums px-1.5 py-0.5 rounded-full font-medium ${
              availability.available > 0
                ? 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)]'
                : 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)]'
            }`}
            title={
              availability.allocated > 0
                ? `Stock: ${availability.available} of ${availability.stockQuantity} units free for this show (${availability.allocated} already allocated to overlapping shows)`
                : `Stock: ${availability.available} of ${availability.stockQuantity} units owned and free for this show`
            }
          >
            {availability.available}/{availability.stockQuantity}
          </span>
        )}

        {/* Source chip — becomes a button when crew-sourced + rail wired.
            On indented rows the supplier-name suffix is dropped (parent
            context already tells you who supplies — the supplied_by name
            still lives in the chip's title). */}
        {item.source !== 'company' && (() => {
          const chip = SOURCE_CHIP_STYLES[item.source];
          const supplierRow = item.source === 'crew' && item.supplied_by_entity_id
            ? crewRows.find((r) => r.entity_id === item.supplied_by_entity_id)
            : null;
          const clickable = !!(onOpenCrewDetail && supplierRow);
          const showSupplierInline = !indented && !!item.supplied_by_name;
          const content = (
            <>
              {chip.label}
              {showSupplierInline && <span className="text-[var(--stage-text-secondary)] ml-0.5">· {item.supplied_by_name}</span>}
            </>
          );
          if (clickable) {
            return (
              <button
                type="button"
                onClick={() => onOpenCrewDetail!(supplierRow!)}
                className={`shrink-0 stage-badge-text tracking-tight px-2 py-0.5 rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ${chip.bg} ${chip.text}`}
                title={`Open ${item.supplied_by_name ?? 'supplier'} in Crew Hub`}
              >
                {content}
              </button>
            );
          }
          return (
            <span
              className={`shrink-0 stage-badge-text tracking-tight px-2 py-0.5 rounded-full ${chip.bg} ${chip.text}`}
              title={item.supplied_by_name ? `Supplied by ${item.supplied_by_name}` : undefined}
            >
              {content}
            </span>
          );
        })()}

        {/* Lineage chip — Phase 2b. Shown only when the lineage view is on. */}
        {lineageChip && (
          <span
            className={`shrink-0 stage-badge-text tracking-tight px-2 py-0.5 rounded-full ${lineageChip.bg} ${lineageChip.text}`}
            title={lineageChip.tooltip}
          >
            {lineageChip.label}
          </span>
        )}

        {/* Crew match suggestion — only for company-sourced items with matches */}
        {item.source === 'company' && crewMatchesForItem && crewMatchesForItem.length > 0 && (
          <span className="shrink-0 flex items-center gap-1.5">
            <span className="stage-badge-text tracking-tight text-[var(--color-unusonic-info)]">
              {crewMatchesForItem[0].entityName}
            </span>
            <button
              type="button"
              disabled={sourcingItem}
              onClick={() => onSourceFromCrew(crewMatchesForItem[0].entityId)}
              className="px-2 py-0.5 rounded-full stage-badge-text tracking-tight font-medium bg-[oklch(0.75_0.15_240_/_0.15)] text-[var(--color-unusonic-info)] hover:bg-[oklch(0.75_0.15_240_/_0.25)] transition-colors disabled:opacity-45"
            >
              {sourcingItem ? '...' : 'Source'}
            </button>
          </span>
        )}

        {/* Step dots — lifecycle progress track. Hidden on indented child
            rows: the parent's rollup ("X of Y loaded") already conveys the
            same information at the bundle level, and the dots take ~80px we
            need for the name. */}
        {!indented && <div className="shrink-0 flex items-center gap-0">
          {GEAR_LIFECYCLE_ORDER.map((step, idx) => {
            const isCompleted = !isBranch && lifecycleIdx >= idx;
            const isCurrent = !isBranch && lifecycleIdx === idx;
            return (
              <div key={step} className="flex items-center">
                {idx > 0 && (
                  <div
                    className="w-2 h-[2px]"
                    style={{
                      background:
                        !isBranch && lifecycleIdx >= idx
                          ? 'var(--color-unusonic-success)'
                          : 'var(--stage-edge-subtle)',
                    }}
                  />
                )}
                <div
                  className="relative rounded-full"
                  style={{
                    width: 8,
                    height: 8,
                    background: isCompleted ? 'var(--color-unusonic-success)' : 'transparent',
                    border: isCompleted ? 'none' : '1.5px solid var(--stage-edge-subtle)',
                    boxShadow: isCurrent ? '0 0 0 2px oklch(1 0 0 / 0.15)' : 'none',
                  }}
                  title={GEAR_STATUS_LABELS[step]}
                />
              </div>
            );
          })}
        </div>}

        {/* Operator avatar */}
        <button
          type="button"
          onClick={onOpenOperatorPicker}
          className="shrink-0 size-5 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          style={{
            background: item.operator_entity_id
              ? 'oklch(1 0 0 / 0.10)'
              : 'transparent',
            border: item.operator_entity_id
              ? '1px solid oklch(1 0 0 / 0.12)'
              : '1px dashed oklch(1 0 0 / 0.20)',
          }}
          title={
            operatorCrew?.entity_name
              ? `Operator: ${operatorCrew.entity_name}`
              : 'Assign operator'
          }
        >
          {item.operator_entity_id && operatorCrew ? (
            <span className="text-micro font-medium text-[var(--stage-text-secondary)]">
              {getInitials(operatorCrew.entity_name)}
            </span>
          ) : (
            <User size={10} strokeWidth={1.5} className="text-[var(--stage-text-tertiary)]" />
          )}
        </button>

        {/* Status label / branch badge */}
        <div className="shrink-0 flex items-center gap-1.5">
          {item.status === 'quarantine' && (
            <span className="px-2 py-0.5 rounded-full stage-badge-text tracking-tight bg-[var(--color-unusonic-error)]/20 text-[var(--color-unusonic-error)]">
              Quarantine
            </span>
          )}
          {item.status === 'sub_rented' && (
            <span className="px-2 py-0.5 rounded-full stage-badge-text tracking-tight bg-[var(--color-unusonic-warning)]/20 text-[var(--color-unusonic-warning)]">
              Sub-rented
            </span>
          )}
          {!isBranch && (
            <button
              type="button"
              onClick={onAdvance}
              disabled={updating || isTerminal}
              className={`
                px-3 py-1 rounded-[22px] text-field-label font-medium tracking-tight
                border transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]
                disabled:opacity-45 disabled:cursor-default
                ${
                  isTerminal
                    ? 'bg-[var(--color-unusonic-success)]/20 text-[var(--stage-text-primary)] border-[var(--color-unusonic-success)]/40'
                    : 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)] border-[oklch(1_0_0_/_0.10)] stage-hover overflow-hidden hover:text-[var(--stage-text-primary)]'
                }
              `}
            >
              {updating ? '...' : GEAR_STATUS_LABELS[item.status]}
            </button>
          )}
        </div>

        {/* More menu for branch states */}
        <div className="shrink-0 relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={onToggleMenu}
            disabled={updating}
            className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] disabled:opacity-45"
            aria-label="More actions"
          >
            <MoreVertical size={14} strokeWidth={1.5} />
          </button>
          {menuOpen &&
            menuPos &&
            createPortal(
              <div
                ref={menuRef}
                className="fixed z-50 min-w-[140px] py-1 rounded-lg border border-[oklch(1_0_0_/_0.10)] shadow-lg"
                style={{
                  top: menuPos.top,
                  left: menuPos.left,
                  background: 'var(--ctx-dropdown, var(--stage-surface-raised))',
                }}
              >
                <RowMenuContent
                  isBranch={isBranch}
                  canDetach={canDetach}
                  onSetStatus={onSetStatus}
                  onCloseMenu={onCloseMenu}
                  onDetach={onDetach}
                />
              </div>,
              document.body,
            )}
        </div>
      </div>

      {/* Operator picker — inline dropdown */}
      <AnimatePresence>
        {operatorPickerOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            className="overflow-hidden"
          >
            <OperatorPicker
              deptCrew={deptCrew}
              department={item.department ?? DEFAULT_DEPARTMENT}
              currentOperatorId={item.operator_entity_id}
              onSelect={onAssignOperator}
              onClose={onOpenOperatorPicker}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

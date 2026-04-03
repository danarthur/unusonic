'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Package,
  MoreVertical,
  Loader2,
  RefreshCw,
  User,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_STAGGER_CHILDREN } from '@/shared/lib/motion-constants';
import {
  getEventGearItems,
  updateGearItemStatus,
  assignGearOperator,
  batchGetGearAvailability,
  type EventGearItem,
  type GearAvailability,
} from '../../actions/event-gear-items';
import {
  GEAR_LIFECYCLE_ORDER,
  GEAR_BRANCH_STATES,
  GEAR_STATUS_LABELS,
  type GearStatus,
} from './types';
import { DEPARTMENT_ORDER, DEFAULT_DEPARTMENT } from '../../lib/department-mapping';
import type { DealCrewRow } from '../../actions/deal-crew';

// =============================================================================
// Helpers
// =============================================================================

function getLifecycleIndex(status: GearStatus): number {
  return GEAR_LIFECYCLE_ORDER.indexOf(status);
}

function isBranchState(status: GearStatus): boolean {
  return GEAR_BRANCH_STATES.includes(status);
}

type DepartmentGearGroup = {
  department: string;
  items: EventGearItem[];
};

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// =============================================================================
// Props
// =============================================================================

type GearFlightCheckProps = {
  eventId: string;
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
  crewRows?: DealCrewRow[];
  onUpdated?: () => void;
  defaultCollapsed?: boolean;
  maxVisible?: number;
  userName?: string;
};

// =============================================================================
// Main component
// =============================================================================

export function GearFlightCheck({
  eventId,
  eventStartsAt,
  eventEndsAt,
  crewRows = [],
  onUpdated,
  defaultCollapsed = false,
  maxVisible = 5,
  userName = 'You',
}: GearFlightCheckProps) {
  const [items, setItems] = useState<EventGearItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Map<string, GearAvailability>>(new Map());
  const [updating, setUpdating] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [operatorPickerOpen, setOperatorPickerOpen] = useState<string | null>(null);

  // ── Fetch gear items ────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEventGearItems(eventId);
      setItems(data);
    } catch (e) {
      setError('Failed to load gear items.');
      console.error('[GearFlightCheck] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ── Fetch availability after items load ─────────────────────────────────────

  useEffect(() => {
    if (items.length === 0 || !eventStartsAt || !eventEndsAt) {
      setAvailability(new Map());
      return;
    }

    const catalogItems = items.filter((i) => i.catalog_package_id);
    if (catalogItems.length === 0) {
      setAvailability(new Map());
      return;
    }

    const batchInput = catalogItems.map((i) => ({
      catalogPackageId: i.catalog_package_id!,
      startDate: eventStartsAt,
      endDate: eventEndsAt,
    }));

    batchGetGearAvailability(batchInput)
      .then((result) => setAvailability(result))
      .catch(() => setAvailability(new Map()));
  }, [items, eventStartsAt, eventEndsAt]);

  // ── Department grouping ─────────────────────────────────────────────────────

  const departmentGroups = useMemo((): DepartmentGearGroup[] => {
    const groups = new Map<string, EventGearItem[]>();
    for (const item of items) {
      const dept = item.department ?? DEFAULT_DEPARTMENT;
      if (!groups.has(dept)) groups.set(dept, []);
      groups.get(dept)!.push(item);
    }

    // Sort by DEPARTMENT_ORDER, with unlisted departments at the end
    const sorted = [...groups.entries()].sort(([a], [b]) => {
      const idxA = (DEPARTMENT_ORDER as readonly string[]).indexOf(a);
      const idxB = (DEPARTMENT_ORDER as readonly string[]).indexOf(b);
      const orderA = idxA >= 0 ? idxA : DEPARTMENT_ORDER.length;
      const orderB = idxB >= 0 ? idxB : DEPARTMENT_ORDER.length;
      return orderA - orderB;
    });

    return sorted.map(([department, deptItems]) => ({ department, items: deptItems }));
  }, [items]);

  // ── Summary stats ───────────────────────────────────────────────────────────

  const linearItems = items.filter((i) => !isBranchState(i.status));
  const loadedOrBeyond = linearItems.filter((i) => getLifecycleIndex(i.status) >= 3);
  const returnedItems = linearItems.filter((i) => i.status === 'returned');
  const allReturned = linearItems.length > 0 && returnedItems.length === linearItems.length;
  const summaryText = items.length === 0
    ? '0 items'
    : allReturned
      ? `${returnedItems.length} of ${linearItems.length} returned`
      : `${loadedOrBeyond.length} of ${linearItems.length} loaded`;
  const summaryProgress =
    linearItems.length > 0 ? (loadedOrBeyond.length / linearItems.length) * 100 : 0;

  // ── Actions ─────────────────────────────────────────────────────────────────

  const advanceItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || isBranchState(item.status)) return;

    const currentIdx = getLifecycleIndex(item.status);
    if (currentIdx < 0 || currentIdx >= GEAR_LIFECYCLE_ORDER.length - 1) return;

    const nextStatus = GEAR_LIFECYCLE_ORDER[currentIdx + 1];
    await setItemStatus(id, nextStatus);
  };

  const setItemStatus = async (id: string, newStatus: GearStatus) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item,
      ),
    );
    setUpdating(id);
    setMenuOpen(null);

    const result = await updateGearItemStatus(id, newStatus, userName);
    setUpdating(null);

    if (result.success) {
      onUpdated?.();
    } else {
      // Revert on failure
      fetchItems();
    }
  };

  const handleAssignOperator = async (itemId: string, entityId: string | null) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, operator_entity_id: entityId } : item,
      ),
    );
    setOperatorPickerOpen(null);

    const result = await assignGearOperator(itemId, entityId);
    if (!result.success) {
      fetchItems();
    } else {
      onUpdated?.();
    }
  };

  const toggleDept = (dept: string) => {
    setCollapsedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) next.delete(dept);
      else next.add(dept);
      return next;
    });
  };

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Gear</h3>
          <span className="flex-1" />
          <Loader2 className="size-4 animate-spin text-[var(--stage-text-tertiary)]" />
        </div>
      </StagePanel>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Gear</h3>
            <p className="text-sm text-[var(--color-unusonic-error)] mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={fetchItems}
            className="p-1.5 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
            aria-label="Retry"
          >
            <RefreshCw size={16} strokeWidth={1.5} />
          </button>
        </div>
      </StagePanel>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (items.length === 0) {
    return (
      <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div>
            <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Gear</h3>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">
              No gear items. Gear will appear here after proposal sync.
            </p>
          </div>
        </div>
      </StagePanel>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  // If only one department, skip the collapsible grouping and show flat list
  const useFlatList = departmentGroups.length === 1;

  return (
    <StagePanel elevated className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">Gear</h3>
          <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">{items.length}</span>
        </div>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">{summaryText}</span>
      </div>

      {/* Summary progress bar */}
      <div className="h-1 rounded-full bg-[oklch(1_0_0_/_0.04)] mt-3 mb-4 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              summaryProgress >= 100
                ? 'var(--color-unusonic-success)'
                : 'var(--stage-text-secondary)',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${summaryProgress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Flat list (single department) */}
      {useFlatList && (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {items.map((item, i) => (
              <motion.li
                key={item.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ ...STAGE_LIGHT, delay: i * STAGE_STAGGER_CHILDREN }}
                className="overflow-hidden"
              >
                <GearItemRow
                  item={item}
                  updating={updating === item.id}
                  menuOpen={menuOpen === item.id}
                  availability={item.catalog_package_id ? availability.get(item.catalog_package_id) : undefined}
                  operatorPickerOpen={operatorPickerOpen === item.id}
                  crewRows={crewRows}
                  onAdvance={() => advanceItem(item.id)}
                  onSetStatus={(s) => setItemStatus(item.id, s)}
                  onToggleMenu={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
                  onCloseMenu={() => setMenuOpen(null)}
                  onOpenOperatorPicker={() => setOperatorPickerOpen(operatorPickerOpen === item.id ? null : item.id)}
                  onAssignOperator={(entityId) => handleAssignOperator(item.id, entityId)}
                />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Department-grouped list */}
      {!useFlatList &&
        departmentGroups.map((group) => {
          const isCollapsed = collapsedDepts.has(group.department);
          // Crew avatars for this department
          const deptCrew = crewRows.filter(
            (r) => r.department === group.department || (!r.department && group.department === DEFAULT_DEPARTMENT),
          );

          return (
            <DepartmentSection
              key={group.department}
              group={group}
              collapsed={isCollapsed}
              onToggle={() => toggleDept(group.department)}
              deptCrew={deptCrew}
              updating={updating}
              menuOpen={menuOpen}
              availability={availability}
              operatorPickerOpen={operatorPickerOpen}
              crewRows={crewRows}
              onAdvance={advanceItem}
              onSetStatus={setItemStatus}
              onToggleMenu={(id) => setMenuOpen(menuOpen === id ? null : id)}
              onCloseMenu={() => setMenuOpen(null)}
              onOpenOperatorPicker={(id) => setOperatorPickerOpen(operatorPickerOpen === id ? null : id)}
              onAssignOperator={handleAssignOperator}
            />
          );
        })}
    </StagePanel>
  );
}

// =============================================================================
// Department section (collapsible)
// =============================================================================

function DepartmentSection({
  group,
  collapsed,
  onToggle,
  deptCrew,
  updating,
  menuOpen,
  availability,
  operatorPickerOpen,
  crewRows,
  onAdvance,
  onSetStatus,
  onToggleMenu,
  onCloseMenu,
  onOpenOperatorPicker,
  onAssignOperator,
}: {
  group: DepartmentGearGroup;
  collapsed: boolean;
  onToggle: () => void;
  deptCrew: DealCrewRow[];
  updating: string | null;
  menuOpen: string | null;
  availability: Map<string, GearAvailability>;
  operatorPickerOpen: string | null;
  crewRows: DealCrewRow[];
  onAdvance: (id: string) => void;
  onSetStatus: (id: string, s: GearStatus) => void;
  onToggleMenu: (id: string) => void;
  onCloseMenu: () => void;
  onOpenOperatorPicker: (id: string) => void;
  onAssignOperator: (itemId: string, entityId: string | null) => void;
}) {
  const { department, items } = group;
  const loadedCount = items.filter(
    (i) => !isBranchState(i.status) && getLifecycleIndex(i.status) >= 3,
  ).length;

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
        <span className="stage-label text-[var(--stage-text-secondary)] tracking-tight">
          {department}
        </span>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
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
                <span className="text-[8px] font-medium text-[var(--stage-text-tertiary)]">
                  {getInitials(c.entity_name)}
                </span>
              </div>
            ))}
            {deptCrew.length > 3 && (
              <span className="text-[9px] text-[var(--stage-text-tertiary)] ml-1.5 tabular-nums">
                +{deptCrew.length - 3}
              </span>
            )}
          </div>
        )}

        <span className="flex-1" />
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tracking-tight tabular-nums">
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
                {items.map((item, i) => (
                  <motion.li
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ ...STAGE_LIGHT, delay: i * STAGE_STAGGER_CHILDREN }}
                    className="overflow-hidden"
                  >
                    <GearItemRow
                      item={item}
                      updating={updating === item.id}
                      menuOpen={menuOpen === item.id}
                      availability={item.catalog_package_id ? availability.get(item.catalog_package_id) : undefined}
                      operatorPickerOpen={operatorPickerOpen === item.id}
                      crewRows={crewRows}
                      onAdvance={() => onAdvance(item.id)}
                      onSetStatus={(s) => onSetStatus(item.id, s)}
                      onToggleMenu={() => onToggleMenu(item.id)}
                      onCloseMenu={onCloseMenu}
                      onOpenOperatorPicker={() => onOpenOperatorPicker(item.id)}
                      onAssignOperator={(entityId) => onAssignOperator(item.id, entityId)}
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

// =============================================================================
// Per-item row
// =============================================================================

type GearItemRowProps = {
  item: EventGearItem;
  updating: boolean;
  menuOpen: boolean;
  availability?: GearAvailability;
  operatorPickerOpen: boolean;
  crewRows: DealCrewRow[];
  onAdvance: () => void;
  onSetStatus: (s: GearStatus) => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onOpenOperatorPicker: () => void;
  onAssignOperator: (entityId: string | null) => void;
};

function GearItemRow({
  item,
  updating,
  menuOpen,
  availability,
  operatorPickerOpen,
  crewRows,
  onAdvance,
  onSetStatus,
  onToggleMenu,
  onCloseMenu,
  onOpenOperatorPicker,
  onAssignOperator,
}: GearItemRowProps) {
  const isBranch = isBranchState(item.status);
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
        className={`flex items-center gap-3 py-2 border-b border-[oklch(1_0_0_/_0.05)] last:border-0 ${isBranch ? 'opacity-60' : ''}`}
      >
        {/* Name + quantity */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <span className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)] truncate">
            {item.name}
          </span>
          {item.quantity > 1 && (
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--stage-text-tertiary)] bg-[oklch(1_0_0_/_0.06)] px-1.5 py-0.5 rounded-full">
              x{item.quantity}
            </span>
          )}
        </div>

        {/* Availability badge */}
        {availability && availability.stockQuantity !== null && (
          <span
            className={`shrink-0 text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-medium ${
              availability.available > 0
                ? 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)]'
                : 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)]'
            }`}
          >
            {availability.available}/{availability.stockQuantity} avail
          </span>
        )}

        {/* Sub-rental badge */}
        {item.is_sub_rental && (
          <span className="shrink-0 text-[10px] font-medium tracking-tight px-2 py-0.5 rounded-full bg-[var(--color-unusonic-warning)]/15 text-[var(--color-unusonic-warning)]">
            Sub-rental
          </span>
        )}

        {/* Step dots — lifecycle progress track */}
        <div className="shrink-0 flex items-center gap-0">
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
        </div>

        {/* Operator avatar */}
        <button
          type="button"
          onClick={onOpenOperatorPicker}
          className="shrink-0 size-5 rounded-full flex items-center justify-center transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]"
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
            <span className="text-[8px] font-medium text-[var(--stage-text-secondary)]">
              {getInitials(operatorCrew.entity_name)}
            </span>
          ) : (
            <User size={10} strokeWidth={1.5} className="text-[var(--stage-text-tertiary)]" />
          )}
        </button>

        {/* Status label / branch badge */}
        <div className="shrink-0 flex items-center gap-1.5">
          {item.status === 'quarantine' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium tracking-tight bg-[var(--color-unusonic-error)]/20 text-[var(--color-unusonic-error)]">
              Quarantine
            </span>
          )}
          {item.status === 'sub_rented' && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium tracking-tight bg-[var(--color-unusonic-warning)]/20 text-[var(--color-unusonic-warning)]">
              Sub-rented
            </span>
          )}
          {!isBranch && (
            <button
              type="button"
              onClick={onAdvance}
              disabled={updating || isTerminal}
              className={`
                px-3 py-1 rounded-[22px] text-[11px] font-medium tracking-tight
                border transition-colors
                focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]
                disabled:opacity-40 disabled:cursor-default
                ${
                  isTerminal
                    ? 'bg-[var(--color-unusonic-success)]/20 text-[var(--stage-text-primary)] border-[var(--color-unusonic-success)]/40'
                    : 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-secondary)] border-[oklch(1_0_0_/_0.10)] hover:bg-[var(--stage-surface-hover)] hover:text-[var(--stage-text-primary)]'
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
            className="p-1 rounded text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] disabled:opacity-40"
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
                {isBranch ? (
                  <button
                    type="button"
                    onClick={() => onSetStatus('allocated')}
                    className="w-full text-left px-3 py-1.5 text-xs text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors"
                  >
                    Return to allocated
                  </button>
                ) : (
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
                  </>
                )}
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

// =============================================================================
// Operator picker
// =============================================================================

function OperatorPicker({
  deptCrew,
  department,
  currentOperatorId,
  onSelect,
  onClose,
}: {
  deptCrew: DealCrewRow[];
  department: string;
  currentOperatorId: string | null;
  onSelect: (entityId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <div className="mt-1 mb-2 rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well,oklch(1_0_0_/_0.04))] overflow-hidden">
      {deptCrew.length === 0 ? (
        <p className="px-3 py-2.5 text-xs text-[var(--stage-text-tertiary)] tracking-tight">
          No crew in {department}
        </p>
      ) : (
        <div className="max-h-[160px] overflow-y-auto">
          {/* Unassign option when currently assigned */}
          {currentOperatorId && (
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                onClose();
              }}
              className="w-full text-left px-3 py-2 text-xs text-[var(--stage-text-tertiary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors border-b border-[oklch(1_0_0_/_0.06)]"
            >
              Unassign operator
            </button>
          )}
          {deptCrew.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onSelect(c.entity_id);
                onClose();
              }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-[oklch(1_0_0_/_0.06)] transition-colors ${
                c.entity_id === currentOperatorId ? 'bg-[oklch(1_0_0_/_0.04)]' : ''
              }`}
            >
              <div className="size-5 rounded-full bg-[oklch(1_0_0_/_0.08)] border border-[oklch(1_0_0_/_0.12)] flex items-center justify-center shrink-0">
                <span className="text-[8px] font-medium text-[var(--stage-text-tertiary)]">
                  {getInitials(c.entity_name)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
                  {c.entity_name ?? c.role_note ?? 'Unknown'}
                </p>
                {c.role_note && c.entity_name && (
                  <p className="text-[10px] text-[var(--stage-text-tertiary)] tracking-tight truncate">
                    {c.role_note}
                  </p>
                )}
              </div>
              {c.entity_id === currentOperatorId && (
                <span className="text-[10px] text-[var(--stage-text-tertiary)]">current</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

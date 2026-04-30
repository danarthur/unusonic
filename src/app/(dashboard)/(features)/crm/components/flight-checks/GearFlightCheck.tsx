'use client';

/**
 * GearFlightCheck — orchestrator panel for event gear lifecycle.
 *
 * Owns state, data-fetching effects (items / availability / crew matches /
 * kit compliance), and the high-level header / sourcing-banner / department-
 * grouped layout. Sub-components live alongside in `gear-flight-check/`:
 *   - shared.tsx          — helpers, types, chip styles
 *   - operator-picker.tsx — crew-member dropdown for operator assignment
 *   - gear-item-row.tsx   — single-row UI: dots, source chip, status button
 *   - department-section.tsx — collapsible per-department group
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import * as Sentry from '@sentry/nextjs';
import { Loader2, Package, RefreshCw } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  assignGearOperator,
  batchGetGearAvailability,
  detachGearFromPackage,
  getCrewEquipmentMatchesForEvent,
  getEventGearItems,
  getGearLineageEnabled,
  materializeKitFromCrew,
  sourceGearFromCrew,
  updateGearItemStatus,
  type CrewGearMatch,
  type EventGearItem,
  type GearAvailability,
  type GearSource,
} from '../../actions/event-gear-items';
import {
  GEAR_LIFECYCLE_ORDER,
  type GearStatus,
} from './types';
import { DEFAULT_DEPARTMENT, DEPARTMENT_ORDER } from '../../lib/department-mapping';
import type { DealCrewRow } from '../../actions/deal-crew';
import {
  getKitComplianceForEntity,
  type KitComplianceResult,
} from '@/features/talent-management/api/kit-template-actions';
import { DepartmentSection } from './gear-flight-check/department-section';
import { GearItemRow } from './gear-flight-check/gear-item-row';
import { KitSyncPicker } from './gear-flight-check/kit-sync-picker';
import { PackageParentRow } from './gear-flight-check/package-parent-row';
import { SourcingBanner } from './gear-flight-check/sourcing-banner';
import {
  SOURCE_CHIP_STYLES,
  buildLineageNodes,
  getLifecycleIndex,
  isBranchState,
  type DepartmentGearGroup,
  type LineageNode,
} from './gear-flight-check/shared';

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
  /** Called when the supplier chip on a crew-sourced item is clicked.
   *  Plan-lens opens the Crew Hub detail rail in response. */
  onOpenCrewDetail?: (row: DealCrewRow) => void;
  /**
   * Phase 2b: when true, render the proposal-gear lineage tree (collapsible
   * package parents with children nested underneath, lineage chips, detach
   * action). When false, render the existing department-grouped flat list.
   * Gated by the `crm.gear_lineage_v1` workspace feature flag — left
   * undefined to let the component resolve the flag itself, set to a boolean
   * to override (tests, storybook, parent-driven force).
   */
  lineageEnabled?: boolean;
  /**
   * When true, render without the StagePanel wrapper — for callers that
   * already nest the gear card inside a panel (Plan tab's "Gear & dispatch"
   * section). Default false preserves the standalone card look used in
   * the event studio.
   */
  bare?: boolean;
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
  userName = 'You',
  onOpenCrewDetail,
  lineageEnabled: lineageOverride,
  bare = false,
}: GearFlightCheckProps) {
  const [items, setItems] = useState<EventGearItem[]>([]);
  const [resolvedLineageFlag, setResolvedLineageFlag] = useState<boolean | null>(null);
  const lineageEnabled = lineageOverride ?? resolvedLineageFlag ?? false;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Map<string, GearAvailability>>(new Map());
  const [crewMatches, setCrewMatches] = useState<Record<string, CrewGearMatch[]>>({});
  const [kitCompliance, setKitCompliance] = useState<Record<string, KitComplianceResult>>({});
  const [sourcing, setSourcing] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [collapsedDepts, setCollapsedDepts] = useState<Set<string>>(new Set());
  const [collapsedParents, setCollapsedParents] = useState<Set<string>>(new Set());
  const [operatorPickerOpen, setOperatorPickerOpen] = useState<string | null>(null);
  const [kitSyncOpen, setKitSyncOpen] = useState<string | null>(null);
  const [kitSyncPending, setKitSyncPending] = useState(false);
  const [sourcingBannerOpen, setSourcingBannerOpen] = useState(false);

  // ── Fetch gear items ────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getEventGearItems(eventId);
      setItems(data);
    } catch (e) {
      setError('Failed to load gear items.');
      Sentry.captureException(e, {
        tags: { component: 'GearFlightCheck', action: 'fetchItems' },
        extra: { eventId },
      });
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Resolve the workspace's lineage flag once on mount. The prop overrides
  // when defined (tests/storybook); otherwise the component asks the server.
  useEffect(() => {
    if (lineageOverride !== undefined) return;
    let cancelled = false;
    getGearLineageEnabled()
      .then((enabled) => {
        if (!cancelled) setResolvedLineageFlag(enabled);
      })
      .catch(() => {
        if (!cancelled) setResolvedLineageFlag(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lineageOverride]);

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

  // ── Fetch crew equipment matches ───────────────────────────────────────────

  useEffect(() => {
    if (items.length === 0) {
      setCrewMatches({});
      return;
    }
    // Only fetch if any items have catalog_package_id (matchable)
    if (!items.some((i) => i.catalog_package_id)) {
      setCrewMatches({});
      return;
    }
    getCrewEquipmentMatchesForEvent(eventId)
      .then((result) => setCrewMatches(result))
      .catch(() => setCrewMatches({}));
  }, [items, eventId]);

  // ── Fetch kit compliance per assigned crew member ──────────────────────────
  // Produces a map keyed by entity_id so DepartmentBlock can aggregate matched/
  // total across the crew assigned to each department. Refetches whenever the
  // (entity_id, role_note) set changes.
  useEffect(() => {
    const targets = crewRows
      .filter((r): r is DealCrewRow & { entity_id: string; role_note: string } =>
        !!r.entity_id && !!r.role_note,
      )
      .map((r) => ({ entityId: r.entity_id, roleNote: r.role_note }));

    if (targets.length === 0) {
      setKitCompliance({});
      return;
    }

    let cancelled = false;
    Promise.all(
      targets.map((t) =>
        getKitComplianceForEntity(t.entityId, t.roleNote).then((result) => ({
          entityId: t.entityId,
          result,
        })),
      ),
    ).then((entries) => {
      if (cancelled) return;
      const map: Record<string, KitComplianceResult> = {};
      for (const e of entries) {
        if (e.result) map[e.entityId] = e.result;
      }
      setKitCompliance(map);
    });
    return () => {
      cancelled = true;
    };
  }, [crewRows]);

  // ── Handle sourcing from crew ──────────────────────────────────────────────

  const handleSourceFromCrew = useCallback(async (itemId: string, entityId: string) => {
    setSourcing(itemId);
    // Optimistic: update item source locally
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, source: 'crew' as GearSource, supplied_by_entity_id: entityId }
          : item,
      ),
    );
    const result = await sourceGearFromCrew({ eventGearItemId: itemId, suppliedByEntityId: entityId });
    setSourcing(null);
    if (result.success) {
      fetchItems(); // Re-fetch to get resolved supplier name
      onUpdated?.();
    } else {
      fetchItems(); // Revert
    }
  }, [fetchItems, onUpdated]);

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

  // Source breakdown for gear gap footer
  const sourceCounts = useMemo(() => {
    const counts = { company: 0, crew: 0, subrental: 0 };
    for (const item of items) {
      counts[item.source] = (counts[item.source] ?? 0) + 1;
    }
    return counts;
  }, [items]);
  const hasMultipleSources = (sourceCounts.crew > 0 ? 1 : 0) + (sourceCounts.subrental > 0 ? 1 : 0) > 0;

  // Company-sourced items that have at least one crew match (could be crew-sourced).
  // Surfaced as the proactive "sourcing opportunities" banner — Layer 2 gap
  // analysis turned from passive stat to actionable recommender.
  const sourcingOpportunities = useMemo(() => {
    const list: { item: EventGearItem; matches: CrewGearMatch[] }[] = [];
    for (const item of items) {
      const matches = crewMatches[item.id];
      if (item.source === 'company' && matches && matches.length > 0) {
        list.push({ item, matches });
      }
    }
    return list;
  }, [items, crewMatches]);
  const crewSourceableCount = sourcingOpportunities.length;

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

  // Phase 2b lineage view ─────────────────────────────────────────────────────
  // Tree assembled from flat items; only consumed when `lineageEnabled` is on.
  const lineageNodes = useMemo<LineageNode[]>(
    () => (lineageEnabled ? buildLineageNodes(items) : []),
    [items, lineageEnabled],
  );

  const toggleParent = (parentId: string) => {
    setCollapsedParents((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const handleDetach = useCallback(async (itemId: string) => {
    // Optimistic: drop the parent link locally so the row pops out of its bundle.
    setItems((prev) =>
      prev.map((row) =>
        row.id === itemId
          ? { ...row, parent_gear_item_id: null, lineage_source: 'pm_detached' as const }
          : row,
      ),
    );
    const result = await detachGearFromPackage(itemId);
    if (!result.success) {
      // Revert on failure.
      fetchItems();
      return;
    }
    onUpdated?.();
  }, [fetchItems, onUpdated]);

  const handleSyncKit = useCallback(async (serviceGearItemId: string, entityId: string) => {
    setKitSyncPending(true);
    const result = await materializeKitFromCrew({ serviceGearItemId, entityId });
    setKitSyncPending(false);
    setKitSyncOpen(null);
    if (!result.success) {
      console.error('[GearFlightCheck] materializeKitFromCrew:', result.error);
      return;
    }
    fetchItems();
    onUpdated?.();
  }, [fetchItems, onUpdated]);

  // When `bare` is on the gear card renders without any wrapper — no
  // StagePanel, no border, no padding — so it can host inside an outer panel
  // (dispatch-summary's "Gear & dispatch" section) without the "card inside a
  // card" stack. StagePanel's `stage-panel` class always carries a border, so
  // we drop the wrapper entirely rather than try to neutralize it.
  const Wrap = ({ children }: { children: ReactNode }) =>
    bare ? (
      <>{children}</>
    ) : (
      <StagePanel
        elevated
        padding="md"
        className="p-5 rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.10)]"
      >
        {children}
      </StagePanel>
    );

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Wrap>
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <h3 className="stage-label">Gear</h3>
          <span className="flex-1" />
          <Loader2 className="size-4 animate-spin text-[var(--stage-text-tertiary)]" />
        </div>
      </Wrap>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <Wrap>
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div className="min-w-0 flex-1">
            <h3 className="stage-label">Gear</h3>
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
      </Wrap>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────────

  if (items.length === 0) {
    return (
      <Wrap>
        <div className="flex items-center gap-3">
          <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
          <div>
            <h3 className="stage-label">Gear</h3>
            <p className="text-sm text-[var(--stage-text-secondary)] mt-0.5">
              No gear items. Gear will appear here after proposal sync.
            </p>
          </div>
        </div>
      </Wrap>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  // If only one department, skip the collapsible grouping and show flat list.
  // (Only consulted when lineageEnabled is off.)
  const useFlatList = departmentGroups.length === 1;

  /** Renders one GearItemRow with all the parent's optimistic-update wiring. */
  const renderItemRow = (item: EventGearItem, opts?: { indented?: boolean }) => (
    <GearItemRow
      item={item}
      updating={updating === item.id}
      menuOpen={menuOpen === item.id}
      availability={item.catalog_package_id ? availability.get(item.catalog_package_id) : undefined}
      operatorPickerOpen={operatorPickerOpen === item.id}
      crewRows={crewRows}
      crewMatchesForItem={crewMatches[item.id]}
      sourcingItem={sourcing === item.id}
      onSourceFromCrew={(entityId) => handleSourceFromCrew(item.id, entityId)}
      onAdvance={() => advanceItem(item.id)}
      onSetStatus={(s) => setItemStatus(item.id, s)}
      onToggleMenu={() => setMenuOpen(menuOpen === item.id ? null : item.id)}
      onCloseMenu={() => setMenuOpen(null)}
      onOpenOperatorPicker={() => setOperatorPickerOpen(operatorPickerOpen === item.id ? null : item.id)}
      onAssignOperator={(entityId) => handleAssignOperator(item.id, entityId)}
      onOpenCrewDetail={onOpenCrewDetail}
      lineageEnabled={lineageEnabled}
      indented={opts?.indented ?? false}
      onDetach={lineageEnabled ? () => handleDetach(item.id) : undefined}
    />
  );

  return (
    <Wrap>
      {/* Header — hidden in bare mode (the host panel already has its own
          "Gear & dispatch" title; rendering "Gear N · X of Y loaded" here
          duplicates it and reads like a second card). Standalone callers
          (event-studio) still get the header. */}
      {!bare && (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Package size={20} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
              <h3 className="stage-label">Gear</h3>
              <span className="text-label text-[var(--stage-text-tertiary)] tabular-nums">{items.length}</span>
            </div>
            <span className="text-label text-[var(--stage-text-tertiary)] tabular-nums">{summaryText}</span>
          </div>
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
              transition={STAGE_MEDIUM}
            />
          </div>
        </>
      )}
      {/* Bare-mode summary line — quiet count anchored to the host title. */}
      {bare && items.length > 0 && (
        <p className="text-label text-[var(--stage-text-tertiary)] tabular-nums mb-2">
          {items.length} item{items.length === 1 ? '' : 's'} · {summaryText}
        </p>
      )}

      {/* Sourcing opportunities — Layer 2 gap-analysis recommender.
       * Surfaced via dedicated sub-component so the orchestrator stays focused
       * on state + grouping. */}
      <SourcingBanner
        opportunities={sourcingOpportunities}
        open={sourcingBannerOpen}
        onToggle={() => setSourcingBannerOpen((v) => !v)}
        sourcingItemId={sourcing}
        onSourceFromCrew={handleSourceFromCrew}
      />

      {/* Lineage tree (Phase 2b) — flat parent/child structure, no department grouping */}
      {lineageEnabled && (
        <ul className="space-y-1">
          <AnimatePresence initial={false}>
            {lineageNodes.map((node) => {
              if (node.kind === 'parent') {
                const collapsed = collapsedParents.has(node.row.id);
                const isService = (node.row.package_snapshot as { category?: string } | null)?.category === 'service';
                const kitOpen = kitSyncOpen === node.row.id;
                return (
                  <motion.li
                    key={node.row.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={STAGE_LIGHT}
                    className="overflow-hidden"
                  >
                    <PackageParentRow
                      parent={node.row}
                      childItems={node.children}
                      collapsed={collapsed}
                      onToggle={() => toggleParent(node.row.id)}
                      onSyncKit={isService ? () => setKitSyncOpen(kitOpen ? null : node.row.id) : undefined}
                    />
                    <AnimatePresence>
                      {kitOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={STAGE_LIGHT}
                          style={{ overflow: 'hidden' }}
                        >
                          <KitSyncPicker
                            crewRows={crewRows}
                            onPick={(entityId) => handleSyncKit(node.row.id, entityId)}
                            onClose={() => setKitSyncOpen(null)}
                            pending={kitSyncPending}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <AnimatePresence initial={false}>
                      {!collapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={STAGE_LIGHT}
                          style={{ overflow: 'hidden' }}
                        >
                          {node.children.map((child) => (
                            <div key={child.id}>{renderItemRow(child, { indented: true })}</div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              }
              return (
                <motion.li
                  key={node.row.id}
                  layout
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_LIGHT}
                  className="overflow-hidden"
                >
                  {renderItemRow(node.row)}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      {/* Flat list (single department) */}
      {!lineageEnabled && useFlatList && (
        <ul className="space-y-1">
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
                {renderItemRow(item)}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}

      {/* Department-grouped list */}
      {!lineageEnabled && !useFlatList &&
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
              kitCompliance={kitCompliance}
              updating={updating}
              menuOpen={menuOpen}
              availability={availability}
              operatorPickerOpen={operatorPickerOpen}
              crewRows={crewRows}
              crewMatches={crewMatches}
              sourcing={sourcing}
              onSourceFromCrew={handleSourceFromCrew}
              onAdvance={advanceItem}
              onSetStatus={setItemStatus}
              onToggleMenu={(id) => setMenuOpen(menuOpen === id ? null : id)}
              onCloseMenu={() => setMenuOpen(null)}
              onOpenOperatorPicker={(id) => setOperatorPickerOpen(operatorPickerOpen === id ? null : id)}
              onAssignOperator={handleAssignOperator}
              onOpenCrewDetail={onOpenCrewDetail}
            />
          );
        })}

      {/* Gear gap summary footer */}
      {(hasMultipleSources || crewSourceableCount > 0) && (
        <div className="mt-4 pt-3 border-t border-[oklch(1_0_0_/_0.06)] flex items-center gap-3 flex-wrap">
          <span className="text-label text-[var(--stage-text-tertiary)]">
            {items.length} items:
          </span>
          {sourceCounts.company > 0 && (
            <span className="text-label tabular-nums text-[var(--stage-text-secondary)]">
              {sourceCounts.company} company
            </span>
          )}
          {sourceCounts.crew > 0 && (
            <span className={`text-label tabular-nums ${SOURCE_CHIP_STYLES.crew.text}`}>
              {sourceCounts.crew} crew-supplied
            </span>
          )}
          {sourceCounts.subrental > 0 && (
            <span className={`text-label tabular-nums ${SOURCE_CHIP_STYLES.subrental.text}`}>
              {sourceCounts.subrental} sub-rental
            </span>
          )}
          {crewSourceableCount > 0 && (
            <span className="text-label tabular-nums text-[var(--color-unusonic-info)]">
              {crewSourceableCount} could be crew-sourced
            </span>
          )}
        </div>
      )}
    </Wrap>
  );
}

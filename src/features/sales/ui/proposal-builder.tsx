'use client';

import React, { useEffect, useState, useCallback, useMemo, useTransition, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookMarked, ChevronDown, ChevronRight, Copy, GripVertical, Plus, Minus, MoreHorizontal, MoveDown, MoveUp, X, FileText, Trash2, PackageOpen } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Sheet, SheetContent, SheetHeader, SheetBody } from '@/shared/ui/sheet';
import { StagePanel } from '@/shared/ui/stage-panel';
import { upsertProposal, publishProposal, sendForSignature, deleteProposalItemsByPackageInstanceId, unpackPackageInstance } from '../api/proposal-actions';
import { createPackage } from '../api/package-actions';
import { PackageSelectorPalette } from './package-selector-palette';
import type { ProposalWithItems, ProposalBuilderLineItem, ProposalLineItemCategory, UnitType } from '../model/types';
import type { RequiredRole } from '../api/package-types';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';
import { ProposalLineInspector } from './proposal-line-inspector';
import { ProposalProductionTeam } from './proposal-production-team';
import { ProposalSummaryCard } from './proposal-summary-card';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { syncCrewFromProposal, getDealCrewEquipmentNames, getDealCrew, type DealCrewRow } from '@/app/(dashboard)/(features)/crm/actions/deal-crew';

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { computeHoursBetween } from '@/shared/lib/parse-time';
import { checkBatchAvailability, type ItemAvailability } from '../api/catalog-availability';
import { getItemHistoryForClient, type ItemClientHistory } from '../api/catalog-customer-history';
import { getAlternativesWithAvailability, type AlternativeWithAvailability } from '../api/catalog-alternatives';
import { swapProposalLineItem } from '../api/proposal-swap-action';
import { RiderParserModal } from '@/features/ai/ui/rider-parser-modal';

import { toLineItemInput, mapProposalItemsToLineItems, groupLineItemsByPackageInstance } from './proposal-utils';
import { ProposalSendFlow } from './proposal-send-flow';

/** Contact with email (from deal stakeholders) for "Send to" picker. */
export type ProposalContact = { id: string; name: string; email: string };

/**
 * Thin render-prop wrapper around `useSortable` so receipt groups can stay
 * rendered inline inside `ProposalBuilder` instead of being extracted into
 * a separate component. Each sortable group receives the sortable props
 * plus `isDragging` for visual state.
 */
type SortableGroupShellChildrenProps = {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners: Record<string, (event: unknown) => void> | undefined;
  isDragging: boolean;
};

function SortableGroupShell({
  id,
  children,
}: {
  id: string;
  children: (props: SortableGroupShellChildrenProps) => React.ReactNode;
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
  };
  return (
    <>
      {children({
        setNodeRef,
        style,
        attributes,
        listeners: listeners as SortableGroupShellChildrenProps['listeners'],
        isDragging,
      })}
    </>
  );
}

export interface ProposalBuilderProps {
  /** Deal id (proposals belong to the deal during Liquid phase). */
  dealId: string;
  workspaceId: string;
  initialProposal?: ProposalWithItems | null;
  /** Client email to pre-fill "Send to" when proposal is sent (e.g. from event or CRM) */
  clientEmail?: string | null;
  /** Contacts from the deal (stakeholders with email) so user can select who to send the proposal to. */
  contacts?: ProposalContact[];
  /** When false, Send is blocked and an error is shown until a client is attached to the deal. */
  clientAttached?: boolean;
  onSaved?: (proposalId: string, total: number) => void;
  /** When true, show proposal as view-only (e.g. in Prism after handover). */
  readOnly?: boolean;
  /** Increment to refetch catalog (e.g. after creating/editing packages in Deal Room). */
  catalogRefreshTrigger?: number;
  /** Called after addPackageToProposal (palette "Apply"); parent should refetch and pass new initialProposal. */
  onProposalRefetch?: () => void;
  /** Shown in empty receipt when used in studio (e.g. "Drop catalog items here"). */
  emptyDropHint?: string;
  /** When true, show gold highlight on the empty drop zone only (studio drag-over). */
  isDragOver?: boolean;
  /** Deal title for proposal link email subject/body. */
  dealTitle?: string | null;
  /** Deal event start time (HH:MM) — auto-inherited by hourly line items. */
  dealEventStartTime?: string | null;
  /** Deal event end time (HH:MM) — auto-inherited by hourly line items. */
  dealEventEndTime?: string | null;
  /** Deal proposed date — used for rental item availability checks. */
  proposedDate?: string | null;
  /** Client entity ID (org or person) — used for customer booking history on line items. */
  clientEntityId?: string | null;
  className?: string;
  /**
   * Telemetry hook fired whenever a line item successfully lands on the
   * receipt. `source` identifies the add path so the proposal-builder studio
   * can attribute first-add / add-success events to the right variant event
   * type. See `ops.proposal_builder_events`.
   */
  onItemAdded?: (source: 'palette' | 'custom', payload?: Record<string, unknown>) => void;
  /**
   * Telemetry hook fired on every successful receipt row reorder (Phase 2).
   * Writes a `row_reorder` event to `ops.proposal_builder_events`. Indices
   * are in the sortable-group space, not the proposal_items.sort_order space.
   */
  onRowReorder?: (payload: {
    from_group_index: number;
    to_group_index: number;
    from_group_id: string;
    to_group_id: string;
  }) => void;
}

export function ProposalBuilder({
  dealId,
  workspaceId,
  initialProposal,
  clientEmail,
  contacts = [],
  clientAttached = true,
  onSaved,
  readOnly = false,
  catalogRefreshTrigger,
  onProposalRefetch,
  emptyDropHint,
  isDragOver = false,
  dealTitle = null,
  dealEventStartTime,
  dealEventEndTime,
  proposedDate,
  clientEntityId,
  className,
  onItemAdded,
  onRowReorder,
}: ProposalBuilderProps) {
  const [crewEquipmentNames, setCrewEquipmentNames] = useState<string[]>([]);
  // Rescan fix C6 (2026-04-11): manual Plan-tab crew additions are invisible
  // in the proposal builder because the builder reads roles from line items
  // only. `getDealCrew(dealId)` returns the full set including source='manual'
  // rows (Production Team Card adds); we filter client-side to the ones whose
  // entity is not already referenced by any line-item requiredRole, and
  // surface them as a non-fatal banner in the Production Team panel so the
  // PM knows they're there but not on the client proposal.
  const [allDealCrew, setAllDealCrew] = useState<DealCrewRow[]>([]);
  const [lineItems, setLineItems] = useState<ProposalBuilderLineItem[]>(() =>
    mapProposalItemsToLineItems(initialProposal, dealEventStartTime, dealEventEndTime)
  );
  const [proposalId, setProposalId] = useState<string | null>(initialProposal?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);
  const [saveToCatalogPending, setSaveToCatalogPending] = useState(false);
  const [saveToCatalogMessage, setSaveToCatalogMessage] = useState<string | null>(null);
  /** Email/name for DocuSeal e-signature. Set by contact pill selection or custom email form. */
  const [signingEmail, setSigningEmail] = useState<string>(clientEmail ?? '');
  const [signingName, setSigningName] = useState<string>('');
  /** Which contact pill is selected in the signature section. */
  const [selectedSignerContactId, setSelectedSignerContactId] = useState<string | null>(null);
  /** When true, show the custom name/email inputs below the contact pills. Always shown when no contacts available. */
  const [showCustomEmailForm, setShowCustomEmailForm] = useState(false);
  const [showDraftSaved, setShowDraftSaved] = useState(false);
  const [selectedLineIndex, setSelectedLineIndex] = useState<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [riderModalOpen, setRiderModalOpen] = useState(false);
  /** Design Phase A: collapsed package groups (by `rowId`). Expanded by default — owners want to see the bundle contents without clicking. */
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(new Set());
  /** Currently open row menu (by `rowId`). Single-open so arrow keys stay sane. */
  const [openRowMenuId, setOpenRowMenuId] = useState<string | null>(null);
  /** Receipt toolbar "more actions" menu (Save to catalog, etc.). */
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  /** True after client-mount — gates `createPortal` so the sticky Send bar renders only after hydration. */
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);
  /** When true, actual_cost is editable for Rental/Retail (sub-rental or custom order). */
  const [subRentalCostUnlocked, setSubRentalCostUnlocked] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sourceOrgId, setSourceOrgId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /** Availability data for rental line items keyed by origin_package_id. */
  const [lineItemAvailability, setLineItemAvailability] = useState<Record<string, ItemAvailability>>({});
  /** Which proposal_item ID has its alternatives picker open (null = none). */
  const [alternativesOpenId, setAlternativesOpenId] = useState<string | null>(null);
  /** Fetched alternatives for the currently open picker. */
  const [alternativesData, setAlternativesData] = useState<AlternativeWithAvailability[]>([]);
  /** Loading state for alternatives fetch. */
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  // Sync line items when parent refetches proposal (e.g. after drop from catalog or "Apply to proposal" in palette).
  useEffect(() => {
    setLineItems(mapProposalItemsToLineItems(initialProposal, dealEventStartTime, dealEventEndTime));
    setProposalId(initialProposal?.id ?? null);
  }, [initialProposal, dealEventStartTime, dealEventEndTime]);

  // Allow the palette-first studio (and any other external surface) to open
  // the built-in PackageSelectorPalette via a window custom event. Keeps the
  // palette state colocated here rather than lifting it to the studio.
  useEffect(() => {
    if (readOnly) return;
    const handler = () => setPaletteOpen(true);
    window.addEventListener('proposal-builder:open-palette', handler);
    return () => window.removeEventListener('proposal-builder:open-palette', handler);
  }, [readOnly]);

  // Fetch crew equipment names for internal source annotations
  useEffect(() => {
    getDealCrewEquipmentNames(dealId).then(setCrewEquipmentNames);
  }, [dealId]);

  // Rescan fix C6: fetch full deal_crew so we can detect manual Plan-tab
  // additions that the proposal builder wouldn't otherwise see. This is the
  // "merge-on-load" half of the crew sync — syncCrewFromProposal handles the
  // opposite direction (proposal → deal_crew).
  const refreshDealCrew = useCallback(() => {
    if (!dealId) return;
    getDealCrew(dealId)
      .then(setAllDealCrew)
      .catch(() => {
        // Non-fatal: worst case the banner doesn't show. The proposal is
        // still usable without the reverse-sync view.
      });
  }, [dealId]);
  useEffect(() => {
    refreshDealCrew();
  }, [refreshDealCrew]);

  // ── Auto-save: debounced persist after user edits ──────────────────────────
  // Skip the first render (initial load) — only save on user-initiated changes.
  const isInitialLoad = useRef(true);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Mark initial load complete after first lineItems sync
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    // Don't auto-save if readOnly, no dealId, or no items
    if (readOnly || !dealId || lineItems.length === 0) return;
    // Don't auto-save while an explicit save/send is in progress
    if (saving || sending) return;

    // Clear previous timer
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(() => {
      startTransition(async () => {
        const input = lineItems.map(toLineItemInput);
        const result = await upsertProposal(dealId, input);
        if (result.proposalId) {
          setProposalId(result.proposalId);
          onSaved?.(result.proposalId, result.total);
          setShowDraftSaved(true);
          // Sync crew assignments from proposal to deal_crew so the deal page stays in sync,
          // then re-fetch so the C6 banner updates if sync resolved a previously-manual row.
          syncCrewFromProposal(dealId)
            .then(refreshDealCrew)
            .catch(() => {});
        }
      });
    }, 1500);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [lineItems, dealId, readOnly, saving, sending, onSaved, refreshDealCrew]);

  // Rescan fix C6: compute the set of manual Plan-tab additions that are not
  // represented by any line item's requiredRoles. These are crew members the
  // PM added on the Deal / Plan tab outside the proposal builder — they
  // won't appear on the client-facing proposal unless the PM adds a line
  // item for them, and without this surfacing they'd be invisible here.
  const planCrewAdditions = useMemo((): DealCrewRow[] => {
    if (allDealCrew.length === 0) return [];
    const proposalEntityIds = new Set<string>();
    for (const li of lineItems) {
      for (const r of li.requiredRoles ?? []) {
        if (r.entity_id) proposalEntityIds.add(r.entity_id);
      }
    }
    return allDealCrew.filter(
      (row) =>
        row.source === 'manual' &&
        row.entity_id != null &&
        !proposalEntityIds.has(row.entity_id)
    );
  }, [allDealCrew, lineItems]);

  // Reset initial load flag when proposal changes (e.g. after adding from catalog)
  useEffect(() => {
    isInitialLoad.current = true;
  }, [initialProposal]);

  // Fetch workspace org id for crew search in production team card
  useEffect(() => {
    getCurrentOrgId().then((id) => setSourceOrgId(id));
  }, []);

  // Derive a stable key from the set of rental package IDs so the availability
  // check doesn't re-fire on every lineItems edit (name/price/qty keystrokes).
  const rentalPackageIdsKey = useMemo(() => {
    const ids = lineItems
      .filter((item) => item.originPackageId && item.category === 'rental')
      .map((item) => item.originPackageId!)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    return ids.sort().join(',');
  }, [lineItems]);

  // Fetch availability for rental line items when the set of rental packages or date changes
  useEffect(() => {
    if (!proposedDate || !workspaceId || !rentalPackageIdsKey) {
      setLineItemAvailability({});
      return;
    }
    const rentalPackageIds = rentalPackageIdsKey.split(',');
    checkBatchAvailability(workspaceId, rentalPackageIds, proposedDate).then((result) => {
      setLineItemAvailability(result);
    });
  }, [proposedDate, workspaceId, rentalPackageIdsKey]);

  // Customer booking history — how many times this client has booked each catalog item
  const [customerHistory, setCustomerHistory] = useState<Record<string, ItemClientHistory>>({});

  // Derive a stable key from unique originPackageIds so history doesn't refetch on every keystroke
  const originPackageIdsKey = useMemo(() => {
    const ids = lineItems
      .filter((item) => item.originPackageId)
      .map((item) => item.originPackageId!)
      .filter((id, i, arr) => arr.indexOf(id) === i);
    return ids.sort().join(',');
  }, [lineItems]);

  useEffect(() => {
    if (!clientEntityId || !originPackageIdsKey) {
      setCustomerHistory({});
      return;
    }
    const packageIds = originPackageIdsKey.split(',');
    let cancelled = false;
    Promise.all(
      packageIds.map((pkgId) =>
        getItemHistoryForClient(pkgId, clientEntityId).then((h) => [pkgId, h] as const)
      )
    ).then((results) => {
      if (cancelled) return;
      const map: Record<string, ItemClientHistory> = {};
      for (const [pkgId, history] of results) {
        if (history.bookingCount > 0) map[pkgId] = history;
      }
      setCustomerHistory(map);
    });
    return () => { cancelled = true; };
  }, [clientEntityId, originPackageIdsKey]);

  // Mobile breakpoint detection for sheet inspector
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    setIsMobile(mq.matches);
    const handler = () => setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Clear "Draft saved" message after 3s
  useEffect(() => {
    if (!showDraftSaved) return;
    const t = setTimeout(() => setShowDraftSaved(false), 3000);
    return () => clearTimeout(t);
  }, [showDraftSaved]);

  const effectiveUnitPrice = (item: ProposalBuilderLineItem) =>
    item.overridePrice != null && Number.isFinite(item.overridePrice) ? item.overridePrice : item.unitPrice;
  const unitMultiplier = (item: ProposalBuilderLineItem) =>
    (item.unitType === 'hour' || item.unitType === 'day') ? Math.max(0, Number(item.unitMultiplier) || 1) : 1;
  const lineTotal = (item: ProposalBuilderLineItem) =>
    item.quantity * unitMultiplier(item) * effectiveUnitPrice(item);
  const total = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);

  const addCustomLineItem = useCallback(() => {
    // Generate a stable client uid so dnd-kit can key the row before it's
    // been saved (server id arrives after auto-save ~1500ms later).
    const clientUid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setLineItems((prev) => [
      ...prev,
      {
        clientUid,
        name: '',
        description: null,
        quantity: 1,
        unitPrice: 0,
        overridePrice: null,
        actualCost: null,
        category: null,
        packageId: null,
        originPackageId: null,
        isPackageHeader: false,
        originalBasePrice: null,
        unitType: 'flat' as UnitType,
        unitMultiplier: 1,
        timeStart: null,
        timeEnd: null,
        showTimesOnProposal: true,
      },
    ]);
    onItemAdded?.('custom');
  }, [onItemAdded]);

  // ── Receipt row reorder (Phase 2, @dnd-kit/sortable) ──────────────────────

  /** Sensors: pointer for mouse/touch, keyboard for a11y (arrow-key reorder). */
  const sortableSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /**
   * Group + stable group id for each item group. Memoized so sortable IDs
   * stay referentially stable across renders that didn't change the line-item
   * array identity.
   */
  const groupedLineItems = useMemo(() => {
    const groups = groupLineItemsByPackageInstance(lineItems);
    return groups.map((group) => {
      const firstItem = lineItems[group.indices[0]];
      // Prefer the packageInstanceId for bundled packages (shared across rows);
      // for ungrouped single items use the client uid (set on creation / map)
      // or the server id. Fallback to a deterministic index string for the
      // edge case of a custom item that somehow lacks both.
      const rowId =
        group.packageInstanceId
          ? `pkg-${group.packageInstanceId}`
          : firstItem?.clientUid
            ? `uid-${firstItem.clientUid}`
            : firstItem?.id
              ? `id-${firstItem.id}`
              : `idx-${group.indices[0]}`;
      return { ...group, rowId };
    });
  }, [lineItems]);

  const sortableGroupIds = useMemo(
    () => groupedLineItems.map((g) => g.rowId),
    [groupedLineItems],
  );

  const handleReceiptDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (readOnly) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIdx = sortableGroupIds.indexOf(String(active.id));
      const toIdx = sortableGroupIds.indexOf(String(over.id));
      if (fromIdx === -1 || toIdx === -1) return;

      const newGroupOrder = arrayMove(groupedLineItems, fromIdx, toIdx);
      // Flatten groups back into a single lineItems array in the new order.
      // Each group's internal index order is preserved (package header stays
      // above its children).
      const nextLineItems = newGroupOrder.flatMap((g) => g.indices.map((i) => lineItems[i]));
      setLineItems(nextLineItems);
      onRowReorder?.({
        from_group_index: fromIdx,
        to_group_index: toIdx,
        from_group_id: String(active.id),
        to_group_id: String(over.id),
      });
    },
    [groupedLineItems, sortableGroupIds, lineItems, readOnly, onRowReorder],
  );

  /**
   * Move a group up or down by one position. Keyboard-accessible (and
   * WCAG 2.5.7–required) non-drag alternative to the grip handle. Reuses
   * the same `arrayMove` + `flatMap` reconstruction as `handleReceiptDragEnd`
   * and emits the same telemetry so dashboards see both paths.
   */
  const moveGroup = useCallback(
    (rowId: string, direction: 'up' | 'down') => {
      if (readOnly) return;
      const fromIdx = sortableGroupIds.indexOf(rowId);
      if (fromIdx === -1) return;
      const toIdx = direction === 'up' ? fromIdx - 1 : fromIdx + 1;
      if (toIdx < 0 || toIdx >= sortableGroupIds.length) return;
      const newGroupOrder = arrayMove(groupedLineItems, fromIdx, toIdx);
      const nextLineItems = newGroupOrder.flatMap((g) => g.indices.map((i) => lineItems[i]));
      setLineItems(nextLineItems);
      onRowReorder?.({
        from_group_index: fromIdx,
        to_group_index: toIdx,
        from_group_id: rowId,
        to_group_id: sortableGroupIds[toIdx],
      });
    },
    [groupedLineItems, sortableGroupIds, lineItems, readOnly, onRowReorder],
  );

  /**
   * Duplicate a group: clone every line item in the group with fresh
   * `clientUid` / `packageInstanceId` so server-side upsert persists them as
   * new rows (rather than updating the originals). Inserted immediately
   * after the source group so the receipt order stays obvious.
   */
  const duplicateGroup = useCallback(
    (rowId: string) => {
      if (readOnly) return;
      const groupIdx = groupedLineItems.findIndex((g) => g.rowId === rowId);
      if (groupIdx === -1) return;
      const group = groupedLineItems[groupIdx];
      const newPackageInstanceId = group.packageInstanceId
        ? typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `dup-${Date.now()}-${Math.random().toString(16).slice(2)}`
        : null;
      const cloned: ProposalBuilderLineItem[] = group.indices.map((i) => {
        const source = lineItems[i];
        const clientUid =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `dup-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return {
          ...source,
          id: undefined, // drop server id so upsert inserts a new row
          clientUid,
          packageInstanceId: newPackageInstanceId,
        };
      });
      // Splice the cloned block in right after the source group.
      const flatBoundaryBefore = groupedLineItems
        .slice(0, groupIdx + 1)
        .reduce((acc, g) => acc + g.indices.length, 0);
      const next = [
        ...lineItems.slice(0, flatBoundaryBefore),
        ...cloned,
        ...lineItems.slice(flatBoundaryBefore),
      ];
      setLineItems(next);
    },
    [groupedLineItems, lineItems, readOnly],
  );

  const toggleGroupCollapsed = useCallback((rowId: string) => {
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const removeGroup = useCallback(
    (packageInstanceId: string) => {
      if (!proposalId) return;
      const next = lineItems.filter((item) => item.packageInstanceId !== packageInstanceId);
      setLineItems(next);
      setSelectedLineIndex(null);
      deleteProposalItemsByPackageInstanceId(proposalId, packageInstanceId).then(() => {
        onProposalRefetch?.();
      });
    },
    [proposalId, lineItems, onProposalRefetch]
  );

  const handleUnpack = useCallback(
    (packageInstanceId: string) => {
      if (!proposalId) return;
      unpackPackageInstance(proposalId, packageInstanceId).then(() => {
        onProposalRefetch?.();
      });
    },
    [proposalId, onProposalRefetch]
  );

  const removeItem = useCallback(
    (index: number) => {
      const next = lineItems.filter((_, i) => i !== index);
      setLineItems(next);
      setSelectedLineIndex((prev) => {
        if (prev == null) return null;
        if (prev === index) return null;
        return prev > index ? prev - 1 : prev;
      });
      // Persist delete to server after commit (avoid "Cannot call startTransition while rendering")
      const input = next.map(toLineItemInput);
      setTimeout(() => {
        startTransition(async () => {
          const result = await upsertProposal(dealId, input);
          if (result.proposalId) {
            setProposalId(result.proposalId);
            onProposalRefetch?.();
          }
        });
      }, 0);
    },
    [dealId, lineItems, onProposalRefetch]
  );

  const updateQuantity = useCallback((index: number, quantity: number) => {
    const parsed = Number(quantity);
    const q = Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : 1;
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: q } : item))
    );
  }, []);

  const updateLineItemOverridePrice = useCallback((index: number, value: number | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, overridePrice: value } : item))
    );
  }, []);

  const updateLineItemActualCost = useCallback((index: number, value: number | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, actualCost: value } : item))
    );
  }, []);

  const updateLineItemName = useCallback((index: number, name: string) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, name: name.trim() || item.name } : item))
    );
  }, []);

  const updateUnitMultiplier = useCallback((index: number, value: number) => {
    const v = Number.isFinite(value) ? Math.max(0.25, value) : 1;
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, unitMultiplier: v } : item))
    );
  }, []);

  /**
   * Billing mode change: updates unitType AND syncs booking_type on required roles.
   * Flat → talent (performer names show on client proposal).
   * Hourly/Daily → labor (billed by duration, names hidden).
   */
  const handleBillingModeChange = useCallback((index: number, newUnitType: UnitType) => {
    setLineItems((prev) => {
      const items = [...prev];
      const item = { ...items[index] };
      const oldUnitType = item.unitType ?? 'flat';
      const currentPrice = item.overridePrice != null && Number.isFinite(item.overridePrice) ? item.overridePrice : item.unitPrice;
      const oldMultiplier = (oldUnitType === 'hour' || oldUnitType === 'day') ? Math.max(1, Number(item.unitMultiplier) || 1) : 1;

      const currentCost = item.actualCost != null && Number.isFinite(item.actualCost) ? item.actualCost : null;

      item.unitType = newUnitType;
      if (newUnitType === 'flat') {
        // Switching to flat: collapse rate × hours into single flat price/cost
        if (oldUnitType !== 'flat' && oldMultiplier > 1) {
          const flatTotal = Math.round(currentPrice * oldMultiplier);
          if (item.overridePrice != null) item.overridePrice = flatTotal;
          else item.unitPrice = flatTotal;
          if (currentCost != null) item.actualCost = Math.round(currentCost * oldMultiplier);
        }
        // Reset multiplier — flat items don't use it
        item.unitMultiplier = 1;
        item.timeStart = null;
        item.timeEnd = null;
        // floorPrice is NOT converted — it's always a total floor, not per-unit
      } else {
        if (!item.timeStart && dealEventStartTime) item.timeStart = dealEventStartTime;
        if (!item.timeEnd && dealEventEndTime) item.timeEnd = dealEventEndTime;
        // Compute hours from time range
        let newMultiplier = item.unitMultiplier ?? 1;
        if (newUnitType === 'hour' && item.timeStart && item.timeEnd) {
          const hours = computeHoursBetween(item.timeStart, item.timeEnd);
          if (hours != null && hours > 0) newMultiplier = hours;
        }
        item.unitMultiplier = newMultiplier;
        // Switching from flat: divide flat price AND cost by hours to get per-unit rates
        // floorPrice is NOT divided — it stays as the total floor
        if (oldUnitType === 'flat' && newMultiplier > 1) {
          if (currentPrice > 0) {
            const perUnitRate = Math.round(currentPrice / newMultiplier);
            if (item.overridePrice != null) item.overridePrice = perUnitRate;
            else item.unitPrice = perUnitRate;
          }
          if (currentCost != null && currentCost > 0) item.actualCost = Math.round(currentCost / newMultiplier);
        }
      }

      // Sync booking_type in required roles based on billing mode
      if (item.requiredRoles && item.requiredRoles.length > 0) {
        const newBookingType = newUnitType === 'flat' ? 'talent' : 'labor';
        item.requiredRoles = item.requiredRoles.map((role: RequiredRole) => ({
          ...role,
          booking_type: newBookingType,
        }));
      }

      items[index] = item;
      return items;
    });
  }, [dealEventStartTime, dealEventEndTime]);

  const updateLineItemUnitPrice = useCallback((index: number, value: number) => {
    const v = Number.isFinite(value) ? Math.max(0, value) : 0;
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, unitPrice: v } : item))
    );
  }, []);

  const handleToggleOptional = useCallback((index: number) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, isOptional: !item.isOptional } : item))
    );
  }, []);

  const updateRoleAssignment = useCallback((lineIdx: number, roleIdx: number, entityId: string | null, name: string | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== lineIdx) return item;
        const roles = [...(item.requiredRoles ?? [])];
        if (roleIdx >= 0 && roleIdx < roles.length) {
          roles[roleIdx] = { ...roles[roleIdx], entity_id: entityId, assignee_name: name };
        }
        return { ...item, requiredRoles: roles };
      })
    );
  }, []);

  const addRoleToLineItem = useCallback((lineIdx: number) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== lineIdx) return item;
        const roles = [...(item.requiredRoles ?? [])];
        const bookingType = item.unitType === 'flat' ? 'talent' : 'labor';
        roles.push({
          role: item.name || 'Crew',
          booking_type: bookingType,
          quantity: 1,
          entity_id: null,
          assignee_name: null,
        } as RequiredRole);
        return { ...item, requiredRoles: roles };
      })
    );
  }, []);

  const updateTimeStart = useCallback((index: number, value: string | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, timeStart: value };
        if (updated.unitType === 'hour' && value && updated.timeEnd) {
          const hours = computeHoursBetween(value, updated.timeEnd);
          if (hours != null && hours > 0) updated.unitMultiplier = hours;
        }
        return updated;
      })
    );
  }, []);

  const updateTimeEnd = useCallback((index: number, value: string | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, timeEnd: value };
        if (updated.unitType === 'hour' && updated.timeStart && value) {
          const hours = computeHoursBetween(updated.timeStart, value);
          if (hours != null && hours > 0) updated.unitMultiplier = hours;
        }
        return updated;
      })
    );
  }, []);

  const updateShowTimesOnProposal = useCallback((index: number, value: boolean) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, showTimesOnProposal: value } : item))
    );
  }, []);

  const updateDisplayGroupName = useCallback((index: number, value: string | null) => {
    setLineItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, displayGroupName: value || null } : item))
    );
  }, []);

  const existingSections = useMemo(() => {
    const names = new Set(lineItems.map((i) => i.displayGroupName).filter(Boolean) as string[]);
    return [...names].sort();
  }, [lineItems]);

  const handleSaveDraft = useCallback(() => {
    setSaving(true);
    startTransition(async () => {
      const input = lineItems.map(toLineItemInput);
      const result = await upsertProposal(dealId, input);
      setSaving(false);
      if (result.proposalId) {
        setProposalId(result.proposalId);
        onSaved?.(result.proposalId, result.total);
        setShowDraftSaved(true);
        syncCrewFromProposal(dealId).catch(() => {});
      }
    });
  }, [dealId, lineItems, onSaved]);

  /** Save current line items as draft, then send via DocuSeal or legacy flow. */
  const handleSendSubmit = useCallback((eEmail: string, eName: string) => {
    setSendError(null);
    setSendNotice(null);
    setSending(true);
    startTransition(async () => {
      try {
        const input = lineItems.map(toLineItemInput);

        // Guard: persist must succeed and yield items before we attempt to send.
        // Without this, an auto-save failure mid-session sends a stale or empty
        // proposal under the e-sign flow.
        if (input.length === 0) {
          setSendError('Add at least one line item before sending.');
          return;
        }

        const upsert = await upsertProposal(dealId, input);
        if (!upsert.proposalId) {
          setSendError(upsert.error ?? 'Failed to save proposal.');
          return;
        }
        setProposalId(upsert.proposalId);
        onSaved?.(upsert.proposalId, upsert.total);

        // DocuSeal path
        if (eEmail.trim()) {
          const result = await sendForSignature(dealId, eEmail.trim(), eName.trim() || eEmail.trim());
          if (result.success) {
            setSentUrl(result.publicUrl);
            setSendError(null);
            if (result.docusealFallback) {
              setSendNotice(
                `E-signature step skipped (${result.docusealFallback.reason}). Sent as a plain proposal link instead.`
              );
            }
          } else {
            setSendError(result.error);
          }
          return;
        }

        // Fallback: publish link only (reached if email somehow empty)
        const pub = await publishProposal(upsert.proposalId);
        if (pub.publicUrl) {
          setSentUrl(pub.publicUrl);
          setSendError(null);
        } else {
          setSendError(pub.error ?? 'Failed to publish proposal.');
        }
      } finally {
        setSending(false);
      }
    });
  }, [dealId, lineItems, onSaved]);


  const handleSaveToCatalog = useCallback(() => {
    if (!workspaceId || lineItems.length === 0) return;
    setSaveToCatalogMessage(null);
    setSaveToCatalogPending(true);
    const name = `Custom bundle – ${new Date().toLocaleDateString()}`;
    const description = lineItems
      .map((i) => `${i.name} × ${i.quantity}${(i.unitType === 'hour' || i.unitType === 'day') ? ` × ${unitMultiplier(i)} ${i.unitType === 'hour' ? 'hrs' : 'days'}` : ''} = $${lineTotal(i).toLocaleString()}`)
      .join('\n');
    const total = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);
    createPackage(workspaceId, {
      name,
      description,
      category: 'package',
      price: total,
    }).then((result) => {
      setSaveToCatalogPending(false);
      if (result.error) {
        setSaveToCatalogMessage(result.error);
      } else {
        setSaveToCatalogMessage('Saved to catalog');
      }
    });
  }, [workspaceId, lineItems]);

  // ── Helpers for inspector alternatives ─────────────────────────────────
  // (Must be declared before the readOnly early return to satisfy rules-of-hooks.)
  const handleShowAlternativesInInspector = useCallback(() => {
    const item = selectedLineIndex != null ? lineItems[selectedLineIndex] : null;
    if (!item?.id || !item.originPackageId || !proposedDate) return;
    const itemId = item.id;
    if (alternativesOpenId === itemId) {
      setAlternativesOpenId(null);
      return;
    }
    setAlternativesOpenId(itemId);
    setAlternativesData([]);
    setAlternativesLoading(true);
    getAlternativesWithAvailability(workspaceId, item.originPackageId, proposedDate)
      .then((alts) => { setAlternativesData(alts); setAlternativesLoading(false); })
      .catch(() => { setAlternativesLoading(false); });
  }, [selectedLineIndex, lineItems, proposedDate, workspaceId, alternativesOpenId]);

  const handleSwapAlternativeInInspector = useCallback(async (alternativeId: string) => {
    const item = selectedLineIndex != null ? lineItems[selectedLineIndex] : null;
    if (!item?.id) return;
    const result = await swapProposalLineItem(item.id, alternativeId);
    if (result.success) {
      setAlternativesOpenId(null);
      setAlternativesData([]);
      onProposalRefetch?.();
    }
  }, [selectedLineIndex, lineItems, onProposalRefetch]);

  if (readOnly) {
    return (
      <div className={cn('flex flex-col gap-4', className)}>
        <StagePanel elevated className="p-6 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)]">
          <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4">
            Proposal (locked)
          </h2>
          {lineItems.length === 0 ? (
            <p className="text-sm text-[var(--stage-text-secondary)]">No line items.</p>
          ) : (
            <ul className="space-y-2">
              {lineItems.map((item, i) => (
                <li
                  key={item.id ?? i}
                  className="flex items-center justify-between gap-4 py-2 border-b border-[var(--stage-edge-subtle)] last:border-0 text-sm"
                >
                  <span className="text-[var(--stage-text-primary)] truncate">{item.name}</span>
                  <span className="text-[var(--stage-text-secondary)] tabular-nums shrink-0">
                    {item.quantity} × ${effectiveUnitPrice(item).toLocaleString()} = $
                    {(item.quantity * effectiveUnitPrice(item)).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t border-[var(--stage-edge-subtle)]">
            <span className="text-sm font-medium uppercase tracking-wide text-[var(--stage-text-secondary)]">Total</span>
            <span className="text-xl font-semibold text-[var(--stage-text-primary)] tabular-nums">${total.toLocaleString()}</span>
          </div>
        </StagePanel>
      </div>
    );
  }

  const receiptHeaderClass = 'flex items-center gap-3 py-2 px-4 mb-3 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] border-b border-[var(--stage-edge-subtle)]';
  const qtyStepperClass =
    'flex flex-col items-center shrink-0 w-10 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-transparent';
  const qtyBtnClass =
    'p-1 w-full flex items-center justify-center text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] disabled:opacity-45 disabled:pointer-events-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset';
  const qtyInputClass =
    'w-full py-0.5 px-0 text-center text-sm font-medium tabular-nums bg-transparent border-0 text-[var(--stage-text-primary)] focus:outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';

  const renderReceiptRow = (index: number, showIncludedWhenZero: boolean) => {
    const item = lineItems[index];
    const isIncluded = showIncludedWhenZero && effectiveUnitPrice(item) === 0;
    const avail = item.originPackageId ? lineItemAvailability[item.originPackageId] : undefined;

    return (
      <motion.li
        key={item.id ?? `row-${index}`}
        layout
        transition={STAGE_MEDIUM}
        className={cn(
          'group flex items-center gap-3 py-2.5 px-4 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] hover:border-[var(--stage-border)] transition-colors duration-[80ms] ease-out cursor-pointer stage-hover overflow-hidden',
          selectedLineIndex === index && 'ring-1 ring-inset ring-[var(--stage-accent)]/40'
        )}
        onClick={() => {
          const next = selectedLineIndex === index ? null : index;
          setSelectedLineIndex(next);
          setSubRentalCostUnlocked(false);
        }}
      >
        {/* Name + indicator badges */}
        <div className="min-w-0 flex-1 flex items-center gap-2">
          <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm leading-snug">
            {item.name || 'Custom item'}
          </p>

          {/* Availability dot */}
          {avail && (
            <span
              className={cn(
                'inline-block w-2 h-2 rounded-full shrink-0',
                avail.status === 'available' ? 'bg-[var(--color-unusonic-success)]' :
                avail.status === 'tight' ? 'bg-[var(--color-unusonic-warning)]' : 'bg-[var(--color-unusonic-error)]'
              )}
              title={
                avail.status === 'available'
                  ? `${avail.available} available`
                  : avail.status === 'tight'
                    ? `${avail.available} of ${avail.stockQuantity} remaining`
                    : `Fully booked (${avail.totalAllocated} allocated, ${avail.stockQuantity} in stock)`
              }
            />
          )}

          {/* Crew-covered annotation (internal only — Phase 4) */}
          {item.category === 'rental' && crewEquipmentNames.some((eq) => item.name.toLowerCase().includes(eq) || eq.includes(item.name.toLowerCase())) && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[oklch(0.65_0.12_250/0.12)] text-[oklch(0.75_0.12_250)] stage-label" title="Assigned crew has matching equipment">
              Crew covered
            </span>
          )}

          {/* Billing mode label (read-only pill — only shown for non-flat) */}
          {item.unitType && item.unitType !== 'flat' && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[oklch(1_0_0_/_0.06)] stage-label">
              {item.unitType === 'hour' ? 'Hourly' : 'Daily'}
            </span>
          )}

          {/* Optional badge */}
          {item.isOptional && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[var(--color-unusonic-info)]/10 stage-badge-text text-[var(--color-unusonic-info)]">
              Optional
            </span>
          )}

          {/* Click to edit hint — visible on hover, hidden when selected */}
          {selectedLineIndex !== index && (
            <span className="shrink-0 text-label text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
              Click to edit
            </span>
          )}
        </div>

        {/* Qty stepper */}
        <div className={qtyStepperClass} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={(e) => {
              updateQuantity(index, item.quantity + 1);
              (e.currentTarget as HTMLButtonElement).blur();
            }}
            className={qtyBtnClass}
            aria-label={`Increase quantity for ${item.name || 'item'}`}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <input
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) => updateQuantity(index, e.target.valueAsNumber)}
            className={qtyInputClass}
            aria-label={`Quantity for ${item.name || 'item'}`}
          />
          <button
            type="button"
            onClick={(e) => {
              updateQuantity(index, item.quantity - 1);
              (e.currentTarget as HTMLButtonElement).blur();
            }}
            disabled={item.quantity <= 1}
            className={qtyBtnClass}
            aria-label={`Decrease quantity for ${item.name || 'item'}`}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Total */}
        <span className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums w-20 shrink-0 text-right">
          {isIncluded ? 'Included' : `$${lineTotal(item).toLocaleString()}`}
        </span>

        {/* Delete */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            removeItem(index);
            if (selectedLineIndex === index) setSelectedLineIndex(null);
          }}
          className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] w-8 h-8 flex items-center justify-center shrink-0"
          aria-label={`Remove ${item.name || 'item'}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </motion.li>
    );
  };

  const receiptListContent = (
    <div className="flex-1 overflow-auto min-h-[160px] min-w-0">
      {lineItems.length > 0 && (
        <div className={receiptHeaderClass}>
          <span className="flex-1">Item</span>
          <span className="text-center w-10 shrink-0">Qty</span>
          <span className="text-right w-20 shrink-0">Total</span>
          <span className="w-8 shrink-0" aria-hidden />
        </div>
      )}
      <DndContext
        sensors={sortableSensors}
        collisionDetection={closestCenter}
        onDragEnd={handleReceiptDragEnd}
        accessibility={{
          // Screen-reader announcements for keyboard drag (Space pickup, Arrow
          // move, Space drop, Escape cancel). Without this dnd-kit ships with
          // nothing, leaving SR users no confirmation mid-reorder.
          announcements: {
            onDragStart: ({ active }) => `Picked up row ${String(active.id)}. Use arrow keys to move, space to drop, escape to cancel.`,
            onDragOver: ({ active, over }) =>
              over ? `Row ${String(active.id)} is over row ${String(over.id)}.` : `Row ${String(active.id)} is no longer over a drop target.`,
            onDragEnd: ({ active, over }) =>
              over ? `Row ${String(active.id)} was dropped over row ${String(over.id)}.` : `Row ${String(active.id)} was dropped.`,
            onDragCancel: ({ active }) => `Reorder of row ${String(active.id)} cancelled.`,
          },
        }}
      >
        <SortableContext items={sortableGroupIds} strategy={verticalListSortingStrategy}>
          {/* touch-pan-y keeps the page's vertical scroll working on iPad
              while the grip handle ('touch-none' below) owns drag initiation. */}
          <ul className="space-y-3 mt-1 pb-1 mx-px touch-pan-y">
            {lineItems.length === 0 ? (
              <li
                className={cn(
                  'text-sm text-[var(--stage-text-secondary)] py-12 px-6 text-center rounded-[var(--stage-radius-panel)] border-2 border-dashed min-h-[160px] flex flex-col items-center justify-center gap-2 transition-colors duration-150',
                  isDragOver
                    ? 'border-[var(--color-unusonic-warning)]/50 bg-[var(--color-unusonic-warning)]/10'
                    : 'border-[var(--stage-border-hover)] bg-[var(--ctx-well)]'
                )}
              >
                <span>{emptyDropHint ?? 'Add items from the catalog or create a custom line item.'}</span>
              </li>
            ) : (
              groupedLineItems.map((group) => {
                const headerIndex = group.indices.find((i) => lineItems[i].isPackageHeader);
                const childIndices = group.indices.filter((i) => !lineItems[i].isPackageHeader);
                const hasHeaderRow = headerIndex !== undefined && group.packageInstanceId;
                const groupLabelForDrag =
                  (headerIndex !== undefined && lineItems[headerIndex]?.name) ||
                  group.displayGroupName ||
                  lineItems[group.indices[0]]?.name ||
                  (group.indices.length > 1 ? 'grouped items' : 'line item');

                return (
                  <SortableGroupShell key={group.rowId} id={group.rowId}>
                    {({ setNodeRef, style, attributes, listeners, isDragging }) => (
                      <li
                        ref={setNodeRef}
                        style={style}
                        className={cn(
                          'group/rr relative space-y-2 list-none rounded-[var(--stage-radius-panel)]',
                          isDragging && 'z-10 ring-1 ring-[var(--stage-accent)]/40',
                        )}
                      >
                        {!readOnly && (
                          // Drag handle: fades in on hover for pointer users,
                          // always visible on coarse-pointer (touch) devices
                          // so iPad at venue walkthroughs finds the reorder
                          // affordance. `{...attributes} {...listeners}`
                          // activate the dnd-kit sortable sensors (pointer +
                          // keyboard) at the handle, never the whole row.
                          <button
                            type="button"
                            aria-label={`Reorder ${groupLabelForDrag}`}
                            className={cn(
                              'absolute -left-6 top-3 flex items-center justify-center w-6 h-6',
                              'rounded text-[var(--stage-text-tertiary)]',
                              // On coarse-pointer devices (touch): always show
                              // at ~40% so the grip is discoverable without hover.
                              // On fine-pointer devices: fade in on hover/focus.
                              'opacity-0 group-hover/rr:opacity-60 focus-visible:opacity-100',
                              '[@media(pointer:coarse)]:opacity-40',
                              'hover:text-[var(--stage-text-primary)] active:cursor-grabbing cursor-grab',
                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                              'touch-none select-none',
                            )}
                            {...attributes}
                            {...listeners}
                          >
                            <GripVertical className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                          </button>
                        )}
                {hasHeaderRow ? (
                  <>
                    {/* Package header row: chevron + bold name, editable package total, row menu (div to avoid li > li) */}
                    {(() => {
                      const item = lineItems[headerIndex!];
                      const index = headerIndex!;
                      const isCollapsed = collapsedGroupIds.has(group.rowId);
                      const childCount = group.indices.length - 1; // minus the header
                      const groupIdxInList = sortableGroupIds.indexOf(group.rowId);
                      const canMoveUp = groupIdxInList > 0;
                      const canMoveDown = groupIdxInList >= 0 && groupIdxInList < sortableGroupIds.length - 1;
                      return (
                        <motion.div
                          layout
                          transition={STAGE_MEDIUM}
                          role="row"
                          data-surface="elevated"
                          className={cn(
                            'py-3.5 px-4 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] hover:border-[var(--stage-border)] min-w-0 transition-colors duration-[80ms] ease-out cursor-pointer stage-hover overflow-hidden',
                            selectedLineIndex === index && 'ring-1 ring-inset ring-[var(--stage-accent)]/40'
                          )}
                          onClick={() => {
                            setSelectedLineIndex(selectedLineIndex === index ? null : index);
                            setSubRentalCostUnlocked(false);
                          }}
                        >
                        <div className="flex items-center gap-3">
                          {/* Chevron disclosure — toggle children. Package groups only. */}
                          <button
                            type="button"
                            aria-label={isCollapsed ? `Expand ${item.name || 'package'}` : `Collapse ${item.name || 'package'}`}
                            aria-expanded={!isCollapsed}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleGroupCollapsed(group.rowId);
                            }}
                            className="shrink-0 flex items-center justify-center w-6 h-6 rounded text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                          >
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                            ) : (
                              <ChevronDown className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[var(--stage-text-primary)] truncate text-base leading-snug tracking-tight">
                              {item.name || 'Package'}
                            </p>
                            <p className="stage-label text-[var(--stage-text-secondary)] mt-0.5">
                              Package total{childCount > 0 ? ` · ${childCount} ${childCount === 1 ? 'item' : 'items'}` : ''}
                            </p>
                          </div>
                          <div className={qtyStepperClass} onClick={(e) => e.stopPropagation()}>
                            <span className="text-sm font-medium text-[var(--stage-text-secondary)] py-2 tabular-nums">1</span>
                          </div>
                          <div className="w-24 shrink-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <CurrencyInput
                              value={String(effectiveUnitPrice(item))}
                              onChange={(v) => updateLineItemUnitPrice(index, Number(v) || 0)}
                              className="text-sm font-semibold text-[var(--stage-text-primary)] text-right w-full min-w-0 rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-2 py-1 tabular-nums"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            {/* Unpack: break the package into editable line items */}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnpack(group.packageInstanceId!);
                                }}
                                className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                                title="Break out to line items: splits the package into individual rows at their catalog prices."
                                aria-label="Break out to line items"
                              >
                                <PackageOpen className="w-4 h-4" />
                              </button>
                            )}
                            {/* Row menu: Move up / Move down / Duplicate / Delete — WCAG 2.5.7 non-drag alternative */}
                            {!readOnly && (
                              <Popover
                                open={openRowMenuId === group.rowId}
                                onOpenChange={(o) => setOpenRowMenuId(o ? group.rowId : null)}
                              >
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={`Options for ${item.name || 'package'}`}
                                    className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                                  >
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent align="end" sideOffset={4} className="w-48 p-1">
                                  <button
                                    type="button"
                                    disabled={!canMoveUp}
                                    onClick={() => {
                                      moveGroup(group.rowId, 'up');
                                      setOpenRowMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--stage-text-primary)] rounded hover:bg-[oklch(1_0_0_/_0.05)] disabled:opacity-35 disabled:pointer-events-none text-left"
                                  >
                                    <MoveUp className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                                    Move up
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!canMoveDown}
                                    onClick={() => {
                                      moveGroup(group.rowId, 'down');
                                      setOpenRowMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--stage-text-primary)] rounded hover:bg-[oklch(1_0_0_/_0.05)] disabled:opacity-35 disabled:pointer-events-none text-left"
                                  >
                                    <MoveDown className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                                    Move down
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      duplicateGroup(group.rowId);
                                      setOpenRowMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--stage-text-primary)] rounded hover:bg-[oklch(1_0_0_/_0.05)] text-left"
                                  >
                                    <Copy className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                                    Duplicate
                                  </button>
                                  <div className="h-px bg-[var(--stage-edge-subtle)] my-1" />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      removeGroup(group.packageInstanceId!);
                                      if (selectedLineIndex === index) setSelectedLineIndex(null);
                                      setOpenRowMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--color-unusonic-error)] rounded hover:bg-[var(--color-unusonic-error)]/10 text-left"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                                    Delete package
                                  </button>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                        </div>
                        </motion.div>
                      );
                    })()}
                    {/* Child rows: indented, show "Included" when $0. Hidden when the header is collapsed. */}
                    {!collapsedGroupIds.has(group.rowId) && (
                      <ul className="pl-5 ml-1 border-l-2 border-[var(--stage-border)] space-y-3 list-none p-0 m-0">
                        {childIndices.map((index) => renderReceiptRow(index, true))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    {group.displayGroupName && group.packageInstanceId && (
                      <div className="flex items-center justify-between gap-2 py-1.5 px-4 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)]">
                        <span className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                          {group.displayGroupName}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeGroup(group.packageInstanceId!)}
                          className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] shrink-0"
                          aria-label={`Remove ${group.displayGroupName}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    <ul
                      className={cn(
                        'space-y-3 list-none p-0 m-0',
                        group.displayGroupName && group.packageInstanceId && 'pl-5 ml-1 border-l-2 border-[var(--stage-border)]'
                      )}
                    >
                      {group.indices.map((index) => renderReceiptRow(index, false))}
                    </ul>
                  </>
                )}
                      </li>
                    )}
                  </SortableGroupShell>
                );
              })
            )}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );

  // ── Proposal summary card values ──────────────────────────────────────────
  const summaryValues = useMemo(() => {
    const totalRevenue = lineItems.reduce((sum, item) => sum + lineTotal(item), 0);
    let hasCost = false;
    let costSum = 0;
    let floorGapCount = 0;
    let floorGapTotal = 0;
    let floorSum = 0;
    let hasFloor = false;
    for (const item of lineItems) {
      // Skip bundle children for cost — the header row carries the total bundle cost.
      const isBundleChild = !item.isPackageHeader && item.packageInstanceId != null;
      if (item.actualCost != null && !isBundleChild) {
        hasCost = true;
        costSum += item.actualCost * item.quantity * unitMultiplier(item);
      }
      // Floor comparison at LINE TOTAL level, not per-unit.
      // floorPrice in the snapshot is the flat total floor for this line item.
      // Compare the actual line total against the floor — regardless of billing mode.
      const itemLineTotal = lineTotal(item);
      const fp = item.floorPrice;
      if (fp != null && itemLineTotal < fp) {
        floorGapCount += 1;
        floorGapTotal += fp - itemLineTotal;
      }
      // Talent budget: floor price is already a total (not per-unit)
      if (!isBundleChild) {
        const floorVal = fp ?? (item.actualCost != null ? item.actualCost * item.quantity * unitMultiplier(item) : null);
        if (floorVal != null) {
          hasFloor = true;
          floorSum += floorVal;
        }
      }
    }
    // talentBudget = revenue minus floor sum; only show when at least one item has a floor or cost
    const talentBudget = hasFloor ? Math.round(totalRevenue - floorSum) : null;
    return {
      totalRevenue,
      estimatedCost: hasCost ? costSum : null,
      floorGapCount,
      floorGapTotal,
      talentBudget,
    };
  }, [lineItems]);

  const selectedItem = selectedLineIndex != null ? lineItems[selectedLineIndex] ?? null : null;
  const inspectorCategory: ProposalLineItemCategory | null = selectedItem?.category ?? null;
  const costFullyEditable = inspectorCategory === 'service' || inspectorCategory === 'talent';
  const costRentalRetail = inspectorCategory === 'rental' || inspectorCategory === 'retail_sale';
  const costEditable = costFullyEditable || (costRentalRetail && subRentalCostUnlocked) || inspectorCategory == null;
  const costHidden = inspectorCategory === 'package' || inspectorCategory === 'fee';

  /** Shared inspector props used by both desktop and mobile renderers. */
  const inspectorProps = selectedItem && selectedLineIndex != null ? {
    item: selectedItem,
    lineIndex: selectedLineIndex,
    onUpdateName: updateLineItemName,
    onUpdateOverridePrice: updateLineItemOverridePrice,
    onUpdateActualCost: updateLineItemActualCost,
    onUpdateUnitPrice: updateLineItemUnitPrice,
    onUpdateDisplayGroupName: updateDisplayGroupName,
    existingSections,
    costEditable,
    costHidden,
    costRentalRetail,
    subRentalCostUnlocked,
    onToggleSubRental: setSubRentalCostUnlocked,
    // New relocated controls
    onUpdateBillingMode: handleBillingModeChange,
    onUpdateUnitMultiplier: updateUnitMultiplier,
    onToggleOptional: handleToggleOptional,
    customerHistory: selectedItem.originPackageId ? customerHistory[selectedItem.originPackageId] ?? null : null,
    availability: selectedItem.originPackageId ? lineItemAvailability[selectedItem.originPackageId] ?? null : null,
    alternativesData,
    alternativesLoading,
    alternativesOpen: selectedItem.id != null && alternativesOpenId === selectedItem.id,
    onShowAlternatives: handleShowAlternativesInInspector,
    onSwapAlternative: handleSwapAlternativeInInspector,
    onCloseAlternatives: () => { setAlternativesOpenId(null); setAlternativesData([]); },
    proposedDate,
    onUpdateTimeStart: updateTimeStart,
    onUpdateTimeEnd: updateTimeEnd,
    onUpdateShowTimes: (index: number, value: boolean) => {
      setLineItems((prev) =>
        prev.map((item, i) => (i === index ? { ...item, showTimesOnProposal: value } : item))
      );
    },
  } as const : null;

  return (
    <div
      className={cn('flex flex-col gap-4', className)}
      // pb keeps the last line items above the sticky Send bar (~88px).
      style={{ overflow: 'visible', paddingBottom: lineItems.length > 0 && !readOnly ? '6rem' : undefined }}
    >
      {/* Design Phase B: 3-column on xl+ (receipt · summary · production team),
          2-column on lg (receipt · stacked rail), 1-column on md-. */}
      <div className="grid gap-6 flex-1 w-full grid-cols-1 lg:grid-cols-[1fr_minmax(280px,340px)] xl:grid-cols-[1fr_minmax(280px,320px)_minmax(280px,320px)]">
        {/* Col 1: Receipt */}
        <div className="min-w-0 flex flex-col">
          <div data-surface="elevated" className="flex flex-col rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]">
            {/* Receipt toolbar — primary + Add, secondary tools, draft status. Always visible. */}
            <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[var(--stage-edge-subtle)]">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="stage-label text-[var(--stage-text-secondary)]">Receipt</h2>
                {showDraftSaved && (
                  <span className="stage-label text-[var(--stage-accent)] animate-in fade-in-0 duration-200" role="status">
                    Draft saved
                  </span>
                )}
                {saveToCatalogMessage && (
                  <span className="stage-label text-[var(--stage-text-secondary)] truncate" role="status">
                    {saveToCatalogMessage}
                  </span>
                )}
              </div>
              {!readOnly && (
                <div className="flex items-center gap-1 shrink-0">
                  {workspaceId && dealId && (
                    <PackageSelectorPalette
                      workspaceId={workspaceId}
                      dealId={dealId}
                      proposedDate={proposedDate}
                      open={paletteOpen}
                      onOpenChange={setPaletteOpen}
                      onApplied={(packageId) => {
                        onItemAdded?.('palette', packageId ? { package_id: packageId } : undefined);
                        onProposalRefetch?.();
                      }}
                      onAddCustomLineItem={addCustomLineItem}
                      trigger={
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-[var(--stage-radius-button)] border border-[var(--stage-border)] bg-[var(--stage-surface-raised)] px-3 py-2 text-sm font-medium text-[var(--stage-text-primary)] hover:border-[var(--stage-border-focus)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                        >
                          <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                          Add from catalog
                          <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 text-[10px] tabular-nums font-medium text-[var(--stage-text-secondary)] bg-[var(--ctx-well)] rounded border border-[var(--stage-edge-subtle)]">
                            ⌘K
                          </kbd>
                        </button>
                      }
                    />
                  )}
                  {/* Parse rider — demoted to an icon button. */}
                  {workspaceId && dealId && (
                    <button
                      type="button"
                      onClick={() => setRiderModalOpen(true)}
                      className="p-2 rounded-[var(--stage-radius-button)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                      aria-label="Parse rider with Aion"
                      title="Parse a rider PDF or text into line items"
                    >
                      <FileText className="w-4 h-4" strokeWidth={1.5} />
                    </button>
                  )}
                  {/* More actions menu — Save to catalog, other power-user ops. */}
                  <Popover open={toolbarMenuOpen} onOpenChange={setToolbarMenuOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="More receipt actions"
                        className="p-2 rounded-[var(--stage-radius-button)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" sideOffset={4} className="w-56 p-1">
                      <button
                        type="button"
                        disabled={lineItems.length === 0 || saveToCatalogPending}
                        onClick={() => {
                          handleSaveToCatalog();
                          setToolbarMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--stage-text-primary)] rounded hover:bg-[oklch(1_0_0_/_0.05)] disabled:opacity-35 disabled:pointer-events-none text-left"
                      >
                        <BookMarked className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                        {saveToCatalogPending ? 'Saving to catalog…' : 'Save as package'}
                      </button>
                      <button
                        type="button"
                        disabled={lineItems.length === 0 || saving || isPending}
                        onClick={() => {
                          handleSaveDraft();
                          setToolbarMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-[var(--stage-text-primary)] rounded hover:bg-[oklch(1_0_0_/_0.05)] disabled:opacity-35 disabled:pointer-events-none text-left"
                      >
                        <FileText className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
                        Save draft now
                      </button>
                    </PopoverContent>
                  </Popover>
                  <RiderParserModal
                    open={riderModalOpen}
                    onOpenChange={setRiderModalOpen}
                    dealId={dealId}
                    workspaceId={workspaceId}
                    onItemsAdded={() => onProposalRefetch?.()}
                  />
                </div>
              )}
            </div>

            {/* Receipt list */}
            <div className="min-w-0 px-4 sm:px-6 py-5">
              {receiptListContent}
            </div>
          </div>
        </div>

        {/* Col 2: Summary + Inspector. On xl this is its own column; on lg it stacks below on
            mobile — sticky-top within the main page scroll. */}
        <div className="min-w-0 flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto">
          {lineItems.length > 0 && (
            <ProposalSummaryCard
              totalRevenue={summaryValues.totalRevenue}
              estimatedCost={summaryValues.estimatedCost}
              floorGapCount={summaryValues.floorGapCount}
              floorGapTotal={summaryValues.floorGapTotal}
              talentBudget={summaryValues.talentBudget}
            />
          )}

          {/* Financial Inspector — slides in when a line item is selected. */}
          {!isMobile && (
            <AnimatePresence>
              {inspectorProps && (
                <ProposalLineInspector {...inspectorProps} />
              )}
            </AnimatePresence>
          )}

          {/* On lg-only (2-col mode): production team stacks below Summary/Inspector here so
              users without the xl viewport still see it. On xl, an identical copy lives in col 3. */}
          <div className="xl:hidden">
            <ProposalProductionTeam
              lineItems={lineItems}
              sourceOrgId={sourceOrgId}
              onUpdateRoleAssignment={updateRoleAssignment}
              onAddRole={addRoleToLineItem}
              onUpdateTimeStart={updateTimeStart}
              onUpdateTimeEnd={updateTimeEnd}
              onUpdateShowTimes={updateShowTimesOnProposal}
              dealEventStartTime={dealEventStartTime}
              dealEventEndTime={dealEventEndTime}
              proposedDate={proposedDate}
              dealId={dealId}
              planCrewAdditions={planCrewAdditions}
            />
          </div>
        </div>

        {/* Col 3 (xl+ only): Production Team — its own column so it doesn't fight the Inspector for space. */}
        <div className="hidden xl:flex min-w-0 flex-col gap-4 xl:sticky xl:top-0 xl:self-start xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
          <ProposalProductionTeam
            lineItems={lineItems}
            sourceOrgId={sourceOrgId}
            onUpdateRoleAssignment={updateRoleAssignment}
            onAddRole={addRoleToLineItem}
            onUpdateTimeStart={updateTimeStart}
            onUpdateTimeEnd={updateTimeEnd}
            onUpdateShowTimes={updateShowTimesOnProposal}
            dealEventStartTime={dealEventStartTime}
            dealEventEndTime={dealEventEndTime}
            proposedDate={proposedDate}
            dealId={dealId}
            planCrewAdditions={planCrewAdditions}
          />
        </div>

        {/* Mobile: sheet inspector */}
        {isMobile && (
          <Sheet
            open={selectedLineIndex != null && selectedItem != null}
            onOpenChange={(open) => { if (!open) setSelectedLineIndex(null); }}
          >
            <SheetContent side="right" className="w-[min(340px,85vw)]">
              <SheetHeader>
                <span className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                  Line item details
                </span>
              </SheetHeader>
              <SheetBody>
                {inspectorProps && (
                  <ProposalLineInspector {...inspectorProps} />
                )}
              </SheetBody>
            </SheetContent>
          </Sheet>
        )}
      </div>

      {/* Sticky Send bar — fixed to the viewport bottom so the closing action is always
          one tap away (Option B from the layout redesign). Portaled to document.body so
          backdrop-filter on Stage Engineering ancestors doesn't clip it (CLAUDE.md rule 10). */}
      {portalReady && !readOnly && lineItems.length > 0 && createPortal(
        <div
          data-surface="raised"
          // bottom-16 on mobile/iPad-portrait lifts above the global MobileDock
          // (lg:hidden, ~64px tall). On lg+ it docks to the viewport bottom.
          className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-30 border-t border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-raised)]/95 backdrop-blur-md"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <div className="max-w-[2400px] mx-auto px-4 sm:px-6">
            <ProposalSendFlow
              contacts={contacts}
              signingEmail={signingEmail}
              signingName={signingName}
              selectedSignerContactId={selectedSignerContactId}
              showCustomEmailForm={showCustomEmailForm}
              sending={sending}
              isPending={isPending}
              clientAttached={clientAttached}
              lineItemCount={lineItems.length}
              onSelectContact={(contactId, name, email) => {
                setSelectedSignerContactId(contactId);
                setSigningName(name);
                setSigningEmail(email);
                setShowCustomEmailForm(false);
              }}
              onDeselectContact={() => {
                setSelectedSignerContactId(null);
                setSigningName('');
                setSigningEmail('');
              }}
              onToggleCustomEmail={() => {
                const next = !showCustomEmailForm;
                setShowCustomEmailForm(next);
                if (next) {
                  setSelectedSignerContactId(null);
                  setSigningName('');
                  setSigningEmail('');
                }
              }}
              onSigningNameChange={(v) => { setSelectedSignerContactId(null); setSigningName(v); }}
              onSigningEmailChange={(v) => { setSelectedSignerContactId(null); setSigningEmail(v); }}
              onSend={() => handleSendSubmit(signingEmail, signingName)}
            />
            {/* Send status messages — sit inside the sticky footer so they're visible
                without scrolling when the proposal is long. */}
            {(sendError || sendNotice || sentUrl) && (
              <div className="pb-3 -mt-1">
                {sendError && (
                  <p className="text-sm text-[var(--color-unusonic-error)]" role="alert">{sendError}</p>
                )}
                {sendNotice && !sendError && (
                  <p className="text-sm text-[var(--stage-text-secondary)]" role="status">{sendNotice}</p>
                )}
                {sentUrl && (
                  <a
                    href={sentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-accent)] underline hover:text-[var(--stage-text-primary)]"
                  >
                    Sent — view proposal link
                  </a>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

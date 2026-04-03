'use client';

import React, { useEffect, useState, useCallback, useMemo, useTransition, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, X, FileText, Send, Mail, BookMarked, Trash2, PackageOpen } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetBody } from '@/shared/ui/sheet';
import { StagePanel } from '@/shared/ui/stage-panel';
import { upsertProposal, publishProposal, sendForSignature, deleteProposalItemsByPackageInstanceId, unpackPackageInstance } from '../api/proposal-actions';
import { createPackage } from '../api/package-actions';
import { PackageSelectorPalette } from './package-selector-palette';
import type { ProposalWithItems, ProposalBuilderLineItem, ProposalLineItemCategory, UnitType } from '../model/types';
import type { RequiredRole } from '../api/package-types';
import { CurrencyInput } from '@/shared/ui/currency-input';
import { cn } from '@/shared/lib/utils';
import { ProposalLineInspector } from './proposal-line-inspector';
import { ProposalProductionTeam } from './proposal-production-team';
import { ProposalSummaryCard } from './proposal-summary-card';
import { getCurrentOrgId } from '@/features/network/api/actions';
import { syncCrewFromProposal } from '@/app/(dashboard)/(features)/crm/actions/deal-crew';

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { computeHoursBetween } from '@/shared/lib/parse-time';
import type { ProposalLineItemInput } from '../api/proposal-actions';
import { checkBatchAvailability, type ItemAvailability } from '../api/catalog-availability';
import { getItemHistoryForClient, type ItemClientHistory } from '../api/catalog-customer-history';
import { getAlternativesWithAvailability, type AlternativeWithAvailability } from '../api/catalog-alternatives';
import { swapProposalLineItem } from '../api/proposal-swap-action';
import { RiderParserModal } from '@/features/ai/ui/rider-parser-modal';

/** Map a UI line item to the server action input shape. Single source of truth — no duplicates. */
function toLineItemInput(item: ProposalBuilderLineItem): ProposalLineItemInput {
  return {
    packageId: item.packageId ?? null,
    originPackageId: item.originPackageId ?? item.packageId ?? null,
    packageInstanceId: item.packageInstanceId ?? null,
    displayGroupName: item.displayGroupName ?? null,
    isClientVisible: item.isClientVisible ?? true,
    isPackageHeader: item.isPackageHeader ?? false,
    originalBasePrice: item.originalBasePrice ?? null,
    unitType: item.unitType ?? 'flat',
    unitMultiplier: item.unitMultiplier ?? 1,
    category: item.category ?? null,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    overridePrice: item.overridePrice ?? null,
    actualCost: item.actualCost ?? null,
    isOptional: item.isOptional ?? false,
    requiredRoles: item.requiredRoles ?? null,
    floorPrice: item.floorPrice ?? null,
    isTaxable: item.isTaxable ?? null,
    timeStart: item.timeStart ?? null,
    timeEnd: item.timeEnd ?? null,
    showTimesOnProposal: item.showTimesOnProposal ?? true,
  };
}

/** Contact with email (from deal stakeholders) for "Send to" picker. */
export type ProposalContact = { id: string; name: string; email: string };

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
}

function mapProposalItemsToLineItems(
  initialProposal: ProposalWithItems | null | undefined,
  dealEventStartTime?: string | null,
  dealEventEndTime?: string | null,
): ProposalBuilderLineItem[] {
  if (!initialProposal?.items?.length) return [];
  return initialProposal.items.map((item) => {
    const row = item as {
      id?: string;
      package_id?: string | null;
      origin_package_id?: string | null;
      package_instance_id?: string | null;
      display_group_name?: string | null;
      is_client_visible?: boolean | null;
      is_package_header?: boolean | null;
      is_optional?: boolean | null;
      original_base_price?: number | null;
      unit_type?: string | null;
      unit_multiplier?: number | null;
      override_price?: number | null;
      actual_cost?: number | null;
      internal_notes?: string | null;
      unit_price?: number;
      name: string;
      description?: string | null;
      quantity: number;
      time_start?: string | null;
      time_end?: string | null;
      show_times_on_proposal?: boolean | null;
      definition_snapshot?: {
        margin_meta?: { category?: string };
        price_meta?: { floor_price?: number | null };
        tax_meta?: { is_taxable?: boolean | null };
        crew_meta?: { required_roles?: unknown[] | null };
      } | null;
    };
    const category = row.definition_snapshot?.margin_meta?.category as ProposalBuilderLineItem['category'] | undefined;
    const floorPrice = row.definition_snapshot?.price_meta?.floor_price ?? null;
    const isTaxable = row.definition_snapshot?.tax_meta?.is_taxable ?? null;
     
    const requiredRoles = (row.definition_snapshot?.crew_meta?.required_roles as any[] | null | undefined) ?? null;
    const unitType = (row.unit_type === 'hour' || row.unit_type === 'day' ? row.unit_type : 'flat') as ProposalBuilderLineItem['unitType'];
    const mapped: ProposalBuilderLineItem = {
      id: row.id,
      packageId: row.package_id ?? null,
      originPackageId: row.origin_package_id ?? null,
      packageInstanceId: row.package_instance_id ?? null,
      displayGroupName: row.display_group_name ?? null,
      isClientVisible: row.is_client_visible ?? true,
      isPackageHeader: row.is_package_header ?? false,
      isOptional: row.is_optional ?? false,
      originalBasePrice: row.original_base_price != null && Number.isFinite(Number(row.original_base_price)) ? Number(row.original_base_price) : null,
      unitType: unitType ?? 'flat',
      unitMultiplier: row.unit_multiplier != null && Number.isFinite(Number(row.unit_multiplier)) ? Number(row.unit_multiplier) : 1,
      category: category ?? null,
      name: row.name,
      description: row.description ?? null,
      quantity: row.quantity,
      unitPrice: Number(row.unit_price ?? 0),
      overridePrice: row.override_price != null ? Number(row.override_price) : null,
      actualCost: row.actual_cost != null ? Number(row.actual_cost) : null,
      floorPrice: floorPrice != null && Number.isFinite(Number(floorPrice)) ? Number(floorPrice) : null,
      isTaxable: isTaxable,
      internalNotes: row.internal_notes ?? null,
      requiredRoles: requiredRoles,
      timeStart: row.time_start ?? null,
      timeEnd: row.time_end ?? null,
      showTimesOnProposal: row.show_times_on_proposal ?? true,
    };

    // Auto-inherit deal event times for hourly items with no saved times
    if (unitType === 'hour' || unitType === 'day') {
      if (!mapped.timeStart && dealEventStartTime) mapped.timeStart = dealEventStartTime;
      if (!mapped.timeEnd && dealEventEndTime) mapped.timeEnd = dealEventEndTime;
    }
    // Auto-compute unitMultiplier from effective times for hourly items
    if (unitType === 'hour' && mapped.timeStart && mapped.timeEnd) {
      const hours = computeHoursBetween(mapped.timeStart, mapped.timeEnd);
      if (hours != null && hours > 0) mapped.unitMultiplier = hours;
    }

    return mapped;
  });
}

/** Group flat line items by package_instance_id for display (Tagged Bursting). */
function groupLineItemsByPackageInstance(
  lineItems: ProposalBuilderLineItem[]
): { packageInstanceId: string | null; displayGroupName: string | null; indices: number[] }[] {
  const byKey = new Map<string, { packageInstanceId: string | null; displayGroupName: string | null; indices: number[] }>();
  lineItems.forEach((item, index) => {
    const key = item.packageInstanceId ?? `ungrouped-${index}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        packageInstanceId: item.packageInstanceId ?? null,
        displayGroupName: item.displayGroupName ?? null,
        indices: [],
      });
    }
    byKey.get(key)!.indices.push(index);
  });
  return Array.from(byKey.values());
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
}: ProposalBuilderProps) {
  const [lineItems, setLineItems] = useState<ProposalBuilderLineItem[]>(() =>
    mapProposalItemsToLineItems(initialProposal, dealEventStartTime, dealEventEndTime)
  );
  const [proposalId, setProposalId] = useState<string | null>(initialProposal?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
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
          // Sync crew assignments from proposal to deal_crew so the deal page stays in sync
          syncCrewFromProposal(dealId).catch(() => {});
        }
      });
    }, 1500);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [lineItems, dealId, readOnly, saving, sending, onSaved]);

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
    setLineItems((prev) => [
      ...prev,
      {
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
    setSending(true);
    startTransition(async () => {
      try {
        const input = lineItems.map(toLineItemInput);

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
    'p-1 w-full flex items-center justify-center text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] disabled:opacity-40 disabled:pointer-events-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset';
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
          'group flex items-center gap-3 py-2.5 px-4 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] hover:border-[var(--stage-border)] hover:bg-[var(--stage-surface-raised)] transition-colors duration-[80ms] ease-out cursor-pointer',
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
                avail.status === 'available' ? 'bg-emerald-400' :
                avail.status === 'tight' ? 'bg-amber-400' : 'bg-red-400'
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

          {/* Billing mode label (read-only pill — only shown for non-flat) */}
          {item.unitType && item.unitType !== 'flat' && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[oklch(1_0_0_/_0.06)] text-[10px] font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">
              {item.unitType === 'hour' ? 'Hourly' : 'Daily'}
            </span>
          )}

          {/* Optional badge */}
          {item.isOptional && (
            <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[var(--color-unusonic-info)]/10 text-[10px] font-medium text-[var(--color-unusonic-info)]">
              Optional
            </span>
          )}

          {/* Click to edit hint — visible on hover, hidden when selected */}
          {selectedLineIndex !== index && (
            <span className="shrink-0 text-[10px] text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
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
      <ul className="space-y-3 mt-1 pb-1 mx-px">
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
          groupLineItemsByPackageInstance(lineItems).map((group) => {
            const headerIndex = group.indices.find((i) => lineItems[i].isPackageHeader);
            const childIndices = group.indices.filter((i) => !lineItems[i].isPackageHeader);
            const hasHeaderRow = headerIndex !== undefined && group.packageInstanceId;

            return (
              <li
                key={group.packageInstanceId ?? `ungrouped-${group.indices[0]}`}
                className="space-y-2 list-none"
              >
                {hasHeaderRow ? (
                  <>
                    {/* Package header row: bold name, editable bundle price, Unpack + Trash (div to avoid li > li) */}
                    {(() => {
                      const item = lineItems[headerIndex!];
                      const index = headerIndex!;
                      return (
                        <motion.div
                          layout
                          transition={STAGE_MEDIUM}
                          role="row"
                          className={cn(
                            'py-3 px-4 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] hover:border-[var(--stage-border)] hover:bg-[var(--stage-surface-raised)] min-w-0 transition-colors duration-[80ms] ease-out cursor-pointer',
                            selectedLineIndex === index && 'ring-1 ring-inset ring-[var(--stage-accent)]/40'
                          )}
                          onClick={() => {
                            setSelectedLineIndex(selectedLineIndex === index ? null : index);
                            setSubRentalCostUnlocked(false);
                          }}
                        >
                        <div className="flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm leading-snug">
                              {item.name || 'Package'}
                            </p>
                            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">Bundle price</p>
                          </div>
                          <div className={qtyStepperClass} onClick={(e) => e.stopPropagation()}>
                            <span className="text-sm font-medium text-[var(--stage-text-secondary)] py-2">1</span>
                          </div>
                          <div className="w-20 shrink-0 flex justify-end" onClick={(e) => e.stopPropagation()}>
                            <CurrencyInput
                              value={String(effectiveUnitPrice(item))}
                              onChange={(v) => updateLineItemUnitPrice(index, Number(v) || 0)}
                              className="text-sm font-medium text-[var(--stage-text-primary)] text-right w-full min-w-0 rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-1.5 py-1"
                            />
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnpack(group.packageInstanceId!);
                              }}
                              className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                              title="Unpack to line items: break the package into individual items at their standard catalog price."
                              aria-label="Unpack to line items"
                            >
                              <PackageOpen className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeGroup(group.packageInstanceId!);
                                if (selectedLineIndex === index) setSelectedLineIndex(null);
                              }}
                              className="p-1.5 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] hover:bg-[var(--color-unusonic-error)]/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                              aria-label={`Remove ${item.name || 'package'}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        </motion.div>
                      );
                    })()}
                    {/* Child rows: indented, show "Included" when $0 */}
                    <ul className="pl-5 ml-1 border-l-2 border-[var(--stage-border)] space-y-3 list-none p-0 m-0">
                      {childIndices.map((index) => renderReceiptRow(index, true))}
                    </ul>
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
            );
          })
        )}
      </ul>
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
    <div className={cn('flex flex-col gap-4', className)} style={{ overflow: 'visible' }}>
      <div className="grid gap-6 flex-1 w-full grid-cols-1 lg:grid-cols-[1fr_minmax(280px,340px)]">
        {/* Left: Receipt */}
        <div className="min-w-0 flex flex-col">
          <div data-surface="elevated" className="flex flex-col min-h-0 max-h-[calc(100vh-7rem)] overflow-hidden rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]">
            <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8">
              <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-5">
                Receipt
              </h2>
              <div className="min-w-0">
                {receiptListContent}
              </div>

            {/* + Add from Catalog — opens palette */}
            <div className="shrink-0 pt-4 mt-2 border-t border-[var(--stage-edge-subtle)]">
              {workspaceId && dealId && (
                <PackageSelectorPalette
                  workspaceId={workspaceId}
                  dealId={dealId}
                  proposedDate={proposedDate}
                  open={paletteOpen}
                  onOpenChange={setPaletteOpen}
                  onApplied={onProposalRefetch}
                  onAddCustomLineItem={addCustomLineItem}
                  trigger={
                    <button
                      type="button"
                      className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-[var(--stage-radius-panel)] border-2 border-dashed border-[var(--stage-border-hover)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[var(--stage-border-focus)] hover:bg-[var(--ctx-well)] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus:ring-offset-2 focus:ring-offset-[var(--stage-void)]"
                    >
                      <Plus className="w-4 h-4" aria-hidden />
                      Add from catalog
                    </button>
                  }
                />
              )}

              {/* Parse rider — opens Aion rider parser modal */}
              {workspaceId && dealId && (
                <>
                  <button
                    type="button"
                    onClick={() => setRiderModalOpen(true)}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 mt-2 rounded-[var(--stage-radius-button)] text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors"
                  >
                    <FileText size={16} strokeWidth={1.5} />
                    Parse rider
                  </button>
                  <RiderParserModal
                    open={riderModalOpen}
                    onOpenChange={setRiderModalOpen}
                    dealId={dealId}
                    workspaceId={workspaceId}
                    onItemsAdded={() => onProposalRefetch?.()}
                  />
                </>
              )}
            </div>

            {/* Send to client */}
            <div className="shrink-0 pt-4 mt-2 border-t border-[var(--stage-edge-subtle)] space-y-3">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
                Send to
              </p>

              {/* Contact pills */}
              {contacts.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {contacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        if (selectedSignerContactId === c.id) {
                          setSelectedSignerContactId(null);
                          setSigningName('');
                          setSigningEmail('');
                        } else {
                          setSelectedSignerContactId(c.id);
                          setSigningName(c.name);
                          setSigningEmail(c.email);
                          setShowCustomEmailForm(false);
                        }
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-[var(--stage-radius-input)] border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                        selectedSignerContactId === c.id
                          ? 'border-[var(--stage-accent)]/60 bg-[var(--stage-accent)]/10 text-[var(--stage-text-primary)]'
                          : 'border-[var(--stage-border)] hover:bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)]'
                      )}
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden />
                      {c.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !showCustomEmailForm;
                      setShowCustomEmailForm(next);
                      if (next) {
                        setSelectedSignerContactId(null);
                        setSigningName('');
                        setSigningEmail('');
                      }
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-[var(--stage-radius-input)] border px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                      showCustomEmailForm
                        ? 'border-[var(--stage-border-focus)] bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-primary)]'
                        : 'border-[var(--stage-border)] hover:bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)]'
                    )}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    Other email
                  </button>
                </div>
              )}

              {/* Email form — shown when "Other email" toggled or when no contacts exist */}
              {(showCustomEmailForm || contacts.length === 0) && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={signingName}
                    onChange={(e) => { setSelectedSignerContactId(null); setSigningName(e.target.value); }}
                    placeholder="Recipient name"
                    className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus:border-[var(--stage-accent)] focus:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
                  />
                  <input
                    type="email"
                    value={signingEmail}
                    onChange={(e) => { setSelectedSignerContactId(null); setSigningEmail(e.target.value); }}
                    placeholder="Recipient email"
                    className="w-full rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] px-3 py-2.5 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] hover:border-[oklch(1_0_0_/_0.15)] focus:outline-none focus:border-[var(--stage-accent)] focus:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] transition-[border-color,box-shadow] duration-[80ms] ease-out"
                  />
                </div>
              )}

              {/* Send button */}
              <button
                type="button"
                onClick={() => handleSendSubmit(signingEmail, signingName)}
                disabled={!signingEmail.trim() || lineItems.length === 0 || sending || isPending || clientAttached === false}
                className="w-full stage-btn stage-btn-primary py-2.5 h-auto disabled:opacity-30"
              >
                <Send className="w-4 h-4" />
                {sending ? 'Sending…' : 'Send proposal'}
              </button>
              {clientAttached === false && (
                <p className="text-xs text-[var(--color-unusonic-error)]">Attach a client to this deal before sending.</p>
              )}
            </div>

            {/* Total + actions */}
            <div className="shrink-0 pt-6 mt-6 border-t border-[var(--stage-edge-subtle)]">
              <div className="flex items-center justify-between gap-4 mb-4">
                <span className="text-sm font-medium uppercase tracking-wide text-[var(--stage-text-secondary)]">
                  Total
                </span>
                <span className="text-xl font-semibold text-[var(--stage-text-primary)] tabular-nums">
                  ${total.toLocaleString()}
                </span>
              </div>

              <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleSaveToCatalog}
                    disabled={lineItems.length === 0 || saveToCatalogPending}
                    className="stage-btn stage-btn-secondary inline-flex items-center gap-2 disabled:opacity-45 disabled:pointer-events-none"
                  >
                    <BookMarked className="w-4 h-4" />
                    {saveToCatalogPending ? 'Saving…' : 'Save to catalog'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={lineItems.length === 0 || saving || isPending}
                    className="stage-btn stage-btn-secondary inline-flex items-center gap-2 disabled:opacity-45 disabled:pointer-events-none"
                  >
                    <FileText className="w-4 h-4" />
                    Save draft
                  </button>
                </div>
                {saveToCatalogMessage && (
                  <p className="mt-2 text-sm text-[var(--stage-text-secondary)]" role="status">
                    {saveToCatalogMessage}
                  </p>
                )}
                {showDraftSaved && (
                  <p className="mt-2 text-sm text-[var(--stage-accent)]" role="status">
                    Draft saved
                  </p>
                )}
                {sendError && (
                  <p className="mt-3 text-sm text-[var(--color-unusonic-error)]" role="alert">
                    {sendError}
                  </p>
                )}
                {sentUrl && (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm text-[var(--stage-accent)]" role="status">
                      Sent to {signingName || signingEmail}.
                    </p>
                    <a
                      href={sentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--stage-text-secondary)] underline hover:text-[var(--stage-text-primary)]"
                    >
                      View proposal link
                    </a>
                  </div>
                )}
                </div>

            </div>
          </div>
        </div>

        {/* Right: Sidebar — always visible on desktop, stacks below on mobile */}
        <div className="min-w-0 flex flex-col gap-4 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:sticky lg:top-0 lg:self-start">
          {/* Proposal health summary — always visible */}
          {lineItems.length > 0 && (
            <ProposalSummaryCard
              totalRevenue={summaryValues.totalRevenue}
              estimatedCost={summaryValues.estimatedCost}
              floorGapCount={summaryValues.floorGapCount}
              floorGapTotal={summaryValues.floorGapTotal}
              talentBudget={summaryValues.talentBudget}
            />
          )}

          {/* Financial Inspector — slides in when a line item is selected */}
          {!isMobile && (
            <AnimatePresence>
              {inspectorProps && (
                <ProposalLineInspector {...inspectorProps} />
              )}
            </AnimatePresence>
          )}

          {/* Production team — always visible when roles exist */}
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
    </div>
  );
}

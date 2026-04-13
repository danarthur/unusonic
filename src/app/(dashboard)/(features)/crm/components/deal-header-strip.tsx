'use client';

/**
 * DealHeaderStrip — the shared identity header at the top of both the
 * Deal lens and Plan lens. Renders the deal title, date/time, archetype,
 * client/venue/owner/planner stakeholders, and all associated inline
 * pickers. Heavy subcomponents (SlotPicker, scalar pickers, contact
 * sheet) live in sibling files.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Eye, Loader2, Plus, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { StagePanel } from '@/shared/ui/stage-panel';
import { TimePicker } from '@/shared/ui/time-picker';
import { formatTime12h } from '@/shared/lib/parse-time';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { toast } from 'sonner';
import { NetworkDetailSheet } from '@/widgets/network-detail';
import type { NetworkSearchOrg, NodeDetail } from '@/features/network-data';
import {
  addDealStakeholder,
  getOrgRosterForStakeholder,
  removeDealStakeholder,
  type DealStakeholderDisplay,
  type OrgRosterContact,
} from '../actions/deal-stakeholders';
import {
  createGhostPlannerEntity,
  createGhostVenueEntity,
  getEntityDisplayName,
} from '../actions/lookup';
import {
  getWorkspaceMembersForPicker,
  type WorkspaceMemberOption,
} from '../actions/get-workspace-members';
import { assignDealOwner } from '../actions/update-deal-status';
import {
  getCoupleEntityForEdit,
  getIndividualEntityForEdit,
  getNodeForSheet,
  type CoupleEntityForEdit,
  type IndividualEntityForEdit,
} from '../actions/get-node-for-sheet';
import { CoupleEditSheet } from './couple-edit-sheet';
import { IndividualEditSheet } from './individual-edit-sheet';
import type { DealDetail } from '../actions/get-deal';
import type { DealClientContext } from '../actions/get-deal-client';
import {
  EntityIcon,
  SlotPicker,
  type SlotType,
} from './deal-header-strip-slot-picker';
import {
  ArchetypePickerPortal,
  DatePickerPortal,
  OwnerPickerPortal,
} from './deal-header-strip-scalar-pickers';
import { ClientContactPickerSheet } from './deal-header-strip-client-sheet';

// =============================================================================
// Types
// =============================================================================

export type DealHeaderStripProps = {
  // Scalars managed by DealLens
  title: string | null;
  proposedDate: string | null;
  eventArchetype: string | null;
  budgetEstimated: number | null;
  readOnly?: boolean;
  saving?: boolean;
  onTitleChange?: (value: string) => void;
  /** Save a scalar field change (date, archetype, budget). Pickers are now owned by the header strip. */
  onSaveScalar?: (patch: {
    proposed_date?: string | null;
    event_archetype?: string | null;
    budget_estimated?: number | null;
    event_start_time?: string | null;
    event_end_time?: string | null;
  }) => void;
  // Stakeholders (client, venue, owner, planner)
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  client: DealClientContext | null;
  sourceOrgId: string | null;
  onStakeholdersChange: () => void;
};

// =============================================================================
// Formatter
// =============================================================================

function formatDate(iso: string): string {
  // Parse yyyy-MM-dd as local date — new Date('yyyy-MM-dd') is UTC midnight
  // and shifts back a day in western timezones.
  const parts = iso.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// =============================================================================
// Component
// =============================================================================

export function DealHeaderStrip({
  title,
  proposedDate,
  eventArchetype,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  budgetEstimated: _budgetEstimated,
  readOnly = false,
  saving = false,
  onTitleChange,
  onSaveScalar,
  deal,
  stakeholders,
  client,
  sourceOrgId,
  onStakeholdersChange,
}: DealHeaderStripProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEditable = !readOnly && !!onTitleChange;

  // ── Scalar picker positioning (date + archetype) ─────────────────────────
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const archetypeTriggerRef = useRef<HTMLDivElement>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [archetypePickerOpen, setArchetypePickerOpen] = useState(false);
  const [scalarPickerPos, setScalarPickerPos] = useState({ top: 0, left: 0, maxLeft: 0 });

  const openPickerAt = (ref: React.RefObject<HTMLElement | null>, dropdownWidth: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - dropdownWidth - 16;
    setScalarPickerPos({
      top: rect.bottom + 6,
      left: Math.min(rect.left, maxLeft),
      maxLeft,
    });
  };

  const handleOpenDatePicker = () => {
    openPickerAt(dateTriggerRef, 220);
    setDatePickerOpen(true);
    setArchetypePickerOpen(false);
  };

  const handleOpenArchetypePicker = () => {
    openPickerAt(archetypeTriggerRef, 220);
    setArchetypePickerOpen(true);
    setDatePickerOpen(false);
  };

  // ── Derived slots ────────────────────────────────────────────────────────
  const billTo = stakeholders.find((s) => s.role === 'bill_to') ?? null;
  const venueSt = stakeholders.find((s) => s.role === 'venue_contact') ?? null;
  const plannerSt = stakeholders.find((s) => s.role === 'planner') ?? null;
  const hasLegacyClient = !billTo && !!client?.organization;

  // ── Owner ────────────────────────────────────────────────────────────────
  const [ownerEntityId, setOwnerEntityId] = useState<string | null>(deal.owner_entity_id ?? null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerPickerPos, setOwnerPickerPos] = useState({ top: 0, left: 0 });
  const ownerTriggerRef = useRef<HTMLDivElement>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberOption[]>([]);
  const [showAllMembers, setShowAllMembers] = useState(false);

  useEffect(() => {
    setOwnerEntityId(deal.owner_entity_id ?? null);
  }, [deal.id, deal.owner_entity_id]);

  useEffect(() => {
    if (!ownerEntityId) {
      setOwnerName(null);
      return;
    }
    const cached = workspaceMembers.find((m) => m.entity_id === ownerEntityId);
    if (cached) {
      setOwnerName(cached.display_name);
      return;
    }
    getEntityDisplayName(ownerEntityId).then((name) => setOwnerName(name ?? 'Assigned'));
  }, [ownerEntityId, workspaceMembers]);

  const salesMembers = useMemo(
    () => workspaceMembers.filter((m) => m.is_sales),
    [workspaceMembers],
  );
  const hasSalesMembers = salesMembers.length > 0;
  const visibleMembers = showAllMembers || !hasSalesMembers ? workspaceMembers : salesMembers;

  const handleOpenOwnerPicker = async () => {
    if (workspaceMembers.length === 0) {
      const members = await getWorkspaceMembersForPicker();
      setWorkspaceMembers(members);
    }
    if (ownerTriggerRef.current) {
      const rect = ownerTriggerRef.current.getBoundingClientRect();
      setOwnerPickerPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShowAllMembers(false);
    setOwnerPickerOpen((v) => !v);
  };

  const handleAssignOwner = async (entityId: string | null) => {
    const name = entityId
      ? workspaceMembers.find((m) => m.entity_id === entityId)?.display_name ?? null
      : null;
    setOwnerEntityId(entityId);
    setOwnerName(name);
    setOwnerPickerOpen(false);
    const result = await assignDealOwner(deal.id, entityId);
    if (!result.success) {
      setOwnerEntityId(deal.owner_entity_id);
      setOwnerName(null);
      toast.error(result.error ?? 'Failed to assign owner');
    }
  };

  // ── Client (bill_to) ─────────────────────────────────────────────────────
  const [pendingClientOrg, setPendingClientOrg] = useState<NetworkSearchOrg | null>(null);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [roster, setRoster] = useState<OrgRosterContact[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleSelectClientOrg = useCallback((org: NetworkSearchOrg) => {
    setPendingClientOrg(org);
    setActiveSlot(null);
    const isCompany =
      !org.entity_type || org.entity_type === 'company' || org.entity_type === 'venue_company';
    if (isCompany) {
      setContactSheetOpen(true);
      setRosterLoading(true);
      getOrgRosterForStakeholder(org.entity_uuid ?? org.id).then((list) => {
        setRoster(list);
        setRosterLoading(false);
      });
    } else {
      handleConfirmBillTo(org, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirmBillTo = async (org: NetworkSearchOrg, entityId: string | null) => {
    setAdding(true);
    setContactSheetOpen(false);
    const result = await addDealStakeholder(deal.id, 'bill_to', {
      organizationId: org.entity_uuid ?? org.id,
      entityId: entityId ?? undefined,
      isPrimary: true,
    });
    setAdding(false);
    setPendingClientOrg(null);
    if (result.success) {
      toast.success(`${org.name} added as client.`);
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  // ── Slot pickers (venue / planner / client) ──────────────────────────────
  const [activeSlot, setActiveSlot] = useState<SlotType | null>(null);
  const [slotPickerPos, setSlotPickerPos] = useState<{ top: number; left: number } | null>(null);
  const clientTriggerRef = useRef<HTMLDivElement>(null);
  const venueTriggerRef = useRef<HTMLDivElement>(null);
  const plannerTriggerRef = useRef<HTMLDivElement>(null);

  const handleOpenSlot = (slot: SlotType, ref: React.RefObject<HTMLDivElement | null>) => {
    if (activeSlot === slot) {
      setActiveSlot(null);
      return;
    }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setSlotPickerPos({ top: rect.bottom + 6, left: rect.left });
    }
    setActiveSlot(slot);
  };

  const handleSlotSelect = useCallback(
    async (slot: SlotType, org: NetworkSearchOrg) => {
      setActiveSlot(null);
      if (slot === 'client') {
        handleSelectClientOrg(org);
        return;
      }
      const role = slot === 'venue' ? 'venue_contact' : 'planner';
      const result = await addDealStakeholder(deal.id, role, {
        organizationId: org.entity_uuid ?? org.id,
        isPrimary: false,
      });
      if (result.success) {
        toast.success(`${org.name} added.`);
        onStakeholdersChange();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    },
    [deal.id, onStakeholdersChange, router, handleSelectClientOrg],
  );

  const handleSlotGhostCreate = useCallback(
    async (slot: SlotType, name: string) => {
      if (slot === 'client') {
        const { createGhostClientEntity } = await import('../actions/lookup');
        const entityId = await createGhostClientEntity(name);
        if (!entityId) {
          toast.error('Failed to create client');
          return;
        }
        setActiveSlot(null);
        const result = await addDealStakeholder(deal.id, 'bill_to', {
          organizationId: entityId,
          isPrimary: true,
        });
        if (result.success) {
          toast.success(`${name} added as client.`);
          onStakeholdersChange();
          router.refresh();
        } else {
          toast.error(result.error);
        }
        return;
      }
      const creator = slot === 'venue' ? createGhostVenueEntity : createGhostPlannerEntity;
      const entityId = await creator(name);
      if (!entityId) {
        toast.error('Failed to create entity');
        return;
      }
      setActiveSlot(null);
      const role = slot === 'venue' ? 'venue_contact' : 'planner';
      const result = await addDealStakeholder(deal.id, role, {
        organizationId: entityId,
        isPrimary: false,
      });
      if (result.success) {
        toast.success(`${name} added.`);
        onStakeholdersChange();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    },
    [deal.id, onStakeholdersChange, router],
  );

  const handleRemove = async (stakeholderId: string) => {
    const result = await removeDealStakeholder(deal.id, stakeholderId);
    if (result.success) {
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  // ── Edit sheets ──────────────────────────────────────────────────────────
  const [sheetDetails, setSheetDetails] = useState<NodeDetail | null>(null);
  const selectedId = searchParams.get('selected');
  const streamMode = searchParams.get('stream') ?? 'inquiry';
  const crmReturnPath = selectedId ? `/crm?selected=${selectedId}&stream=${streamMode}` : '/crm';

  const [coupleEdit, setCoupleEdit] = useState<{
    open: boolean;
    entityId: string;
    initialValues: CoupleEntityForEdit;
  } | null>(null);
  const [individualEdit, setIndividualEdit] = useState<{
    open: boolean;
    entityId: string;
    initialValues: IndividualEntityForEdit;
  } | null>(null);

  // The edit-sheet handlers below are kept around for consumers (e.g. context
  // menus) even though the inline edit buttons were removed when we moved to
  // the click-to-swap pattern.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleEditClick = async (relationshipId: string) => {
    const details = await getNodeForSheet(relationshipId);
    if (details) setSheetDetails(details);
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleCoupleEditClick = async (entityId: string) => {
    const data = await getCoupleEntityForEdit(entityId);
    if (data) setCoupleEdit({ open: true, entityId, initialValues: data });
    else toast.error('Could not load couple details.');
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleIndividualEditClick = async (entityId: string) => {
    const data = await getIndividualEntityForEdit(entityId);
    if (data) setIndividualEdit({ open: true, entityId, initialValues: data });
    else toast.error('Could not load client details.');
  };

  // Dismiss pickers on outside click
  useEffect(() => {
    if (!activeSlot && !ownerPickerOpen && !datePickerOpen && !archetypePickerOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('[data-header-picker]')) {
        setActiveSlot(null);
        setOwnerPickerOpen(false);
        setDatePickerOpen(false);
        setArchetypePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeSlot, ownerPickerOpen, datePickerOpen, archetypePickerOpen]);

  // ============================================================================
  // Render helpers
  // ============================================================================

  const renderStakeholderChip = (s: DealStakeholderDisplay) => {
    const entityId = s.organization_id;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <EntityIcon
          entityType={s.entity_type}
          className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0"
        />
        <span className="stage-readout truncate">{s.name}</span>
        {entityId && (
          <a
            href={`/network/entity/${entityId}?kind=external_partner`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-0.5 rounded-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
            title="View in network"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>
    );
  };

  const ownerLabel = ownerEntityId ? ownerName ?? 'Loading…' : null;

  // Field-on-surface pattern: labels + values sit directly on the panel.
  const fieldLabel =
    'stage-label text-[var(--stage-text-tertiary)] mb-1 select-none leading-none';
  const emptyValue = 'stage-field-label text-[var(--stage-text-tertiary)] flex items-center gap-1.5';
  const fieldBlock = 'px-3 py-2.5 min-w-0';
  const fieldBlockInteractive =
    'cursor-pointer [border-radius:var(--stage-radius-input,6px)] hover:bg-[var(--stage-accent-muted)] transition-colors';

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={STAGE_MEDIUM}>
        <StagePanel elevated className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="stage-label">Deal</p>
            {deal.event_id && !readOnly && (
              <Link
                href={`/preview/deal/${deal.id}`}
                className="flex items-center gap-1.5 stage-badge-text transition-colors pointer-events-auto opacity-100"
                style={{ color: 'var(--stage-text-tertiary)' }}
              >
                <Eye size={12} strokeWidth={1.5} />
                Preview portal
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-2.5">
            {/* ── Row 0: Title + Date + Time ── */}
            <div className="flex items-start gap-2 min-w-0">
              {/* Title */}
              <div className={cn(fieldBlock, 'flex-1 group', isEditable && fieldBlockInteractive)}>
                <p className={fieldLabel}>Deal</p>
                {isEditable ? (
                  <input
                    type="text"
                    value={title ?? ''}
                    onChange={(e) => onTitleChange!(e.target.value)}
                    placeholder="Untitled deal"
                    className="bg-transparent stage-readout focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] min-w-0 w-full placeholder:text-[var(--stage-text-secondary)]"
                  />
                ) : (
                  <p className="stage-readout text-[var(--stage-text-secondary)] truncate">
                    {title || 'Untitled deal'}
                  </p>
                )}
                {saving && (
                  <span className="text-micro text-[var(--stage-text-tertiary)] tracking-wide mt-1 block">
                    Saving…
                  </span>
                )}
              </div>

              {/* Date */}
              <div className="relative" data-header-picker>
                <button
                  ref={dateTriggerRef}
                  type="button"
                  onClick={!readOnly ? handleOpenDatePicker : undefined}
                  disabled={readOnly}
                  className={cn(fieldBlock, 'text-left shrink-0', !readOnly && fieldBlockInteractive)}
                >
                  <p className={fieldLabel}>Date</p>
                  {proposedDate ? (
                    <span className="stage-readout whitespace-nowrap">{formatDate(proposedDate)}</span>
                  ) : (
                    <span className={cn(emptyValue, 'whitespace-nowrap')}>
                      {!readOnly ? (
                        <>
                          <Plus size={9} />
                          add
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  )}
                </button>
                {datePickerOpen && (
                  <DatePickerPortal
                    position={scalarPickerPos}
                    proposedDate={proposedDate}
                    onChange={(val) => onSaveScalar?.({ proposed_date: val })}
                    onClose={() => setDatePickerOpen(false)}
                  />
                )}
              </div>

              {/* Time */}
              <div className={cn(fieldBlock, 'shrink-0')}>
                <p className={fieldLabel}>Time</p>
                {isEditable ? (
                  <div className="flex items-center gap-2 min-w-0">
                    <TimePicker
                      value={deal.event_start_time ?? null}
                      onChange={(v) => onSaveScalar?.({ event_start_time: v })}
                      placeholder="Start"
                      context="evening"
                      variant="ghost"
                      className="w-[90px]"
                    />
                    <span className="text-[var(--stage-text-tertiary)] text-xs select-none px-0.5">–</span>
                    <TimePicker
                      value={deal.event_end_time ?? null}
                      onChange={(v) => onSaveScalar?.({ event_end_time: v })}
                      placeholder="End"
                      context="evening"
                      variant="ghost"
                      className="w-[90px]"
                    />
                  </div>
                ) : (
                  <span className="stage-readout text-[var(--stage-text-secondary)] whitespace-nowrap">
                    {deal.event_start_time
                      ? `${formatTime12h(deal.event_start_time)}${
                          deal.event_end_time ? ` – ${formatTime12h(deal.event_end_time)}` : ''
                        }`
                      : '—'}
                  </span>
                )}
              </div>
            </div>

            <div className="stage-divider" />

            {/* ── Stakeholder grid: 2×2 ── */}
            <div className="grid grid-cols-2 gap-2">
              {/* Client */}
              <div className="relative" data-header-picker ref={clientTriggerRef}>
                <div
                  className={cn(fieldBlock, 'w-full', !readOnly && fieldBlockInteractive)}
                  onClick={!readOnly ? () => handleOpenSlot('client', clientTriggerRef) : undefined}
                >
                  <p className={fieldLabel}>Client</p>
                  {billTo ? (
                    renderStakeholderChip(billTo)
                  ) : hasLegacyClient ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Building2 className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
                      <span className="stage-readout truncate">{client!.organization.name}</span>
                    </div>
                  ) : (
                    <span className={emptyValue}>
                      {!readOnly ? (
                        <>
                          <Plus size={9} />
                          add
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  )}
                </div>
                <AnimatePresence>
                  {activeSlot === 'client' && sourceOrgId && (
                    <SlotPicker
                      sourceOrgId={sourceOrgId}
                      slot="client"
                      triggerRect={slotPickerPos}
                      onSelect={(org) => handleSlotSelect('client', org)}
                      onGhostCreate={(name) => handleSlotGhostCreate('client', name)}
                      onClear={billTo ? () => handleRemove(billTo.id) : undefined}
                      onClose={() => setActiveSlot(null)}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Venue */}
              <div className="relative" data-header-picker ref={venueTriggerRef}>
                <div
                  className={cn(fieldBlock, 'w-full', !readOnly && fieldBlockInteractive)}
                  onClick={!readOnly ? () => handleOpenSlot('venue', venueTriggerRef) : undefined}
                >
                  <p className={fieldLabel}>Venue</p>
                  {venueSt ? (
                    renderStakeholderChip(venueSt)
                  ) : (
                    <span className={emptyValue}>
                      {!readOnly ? (
                        <>
                          <Plus size={9} />
                          add
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  )}
                </div>
                <AnimatePresence>
                  {activeSlot === 'venue' && sourceOrgId && (
                    <SlotPicker
                      sourceOrgId={sourceOrgId}
                      slot="venue"
                      triggerRect={slotPickerPos}
                      onSelect={(org) => handleSlotSelect('venue', org)}
                      onGhostCreate={(name) => handleSlotGhostCreate('venue', name)}
                      onClear={venueSt ? () => handleRemove(venueSt.id) : undefined}
                      onClose={() => setActiveSlot(null)}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Owner */}
              <div className="relative" data-header-picker ref={ownerTriggerRef}>
                <div
                  className={cn(fieldBlock, 'w-full', !readOnly && fieldBlockInteractive)}
                  onClick={!readOnly ? handleOpenOwnerPicker : undefined}
                >
                  <p className={fieldLabel}>Owner</p>
                  {ownerLabel ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
                      <span className="stage-readout truncate">{ownerLabel}</span>
                    </div>
                  ) : (
                    <span className={emptyValue}>
                      {!readOnly ? (
                        <>
                          <Plus size={9} />
                          assign
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  )}
                </div>
                {ownerPickerOpen && workspaceMembers.length > 0 && (
                  <OwnerPickerPortal
                    position={ownerPickerPos}
                    ownerEntityId={ownerEntityId}
                    members={workspaceMembers}
                    visibleMembers={visibleMembers}
                    hasSalesMembers={hasSalesMembers}
                    showAllMembers={showAllMembers}
                    onShowAll={() => setShowAllMembers(true)}
                    onAssign={handleAssignOwner}
                  />
                )}
              </div>

              {/* Planner */}
              <div className="relative" data-header-picker ref={plannerTriggerRef}>
                <div
                  className={cn(fieldBlock, 'w-full', !readOnly && fieldBlockInteractive)}
                  onClick={!readOnly ? () => handleOpenSlot('planner', plannerTriggerRef) : undefined}
                >
                  <p className={fieldLabel}>Planner</p>
                  {plannerSt ? (
                    renderStakeholderChip(plannerSt)
                  ) : (
                    <span className={emptyValue}>
                      {!readOnly ? (
                        <>
                          <Plus size={9} />
                          add
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                  )}
                </div>
                <AnimatePresence>
                  {activeSlot === 'planner' && sourceOrgId && (
                    <SlotPicker
                      sourceOrgId={sourceOrgId}
                      slot="planner"
                      triggerRect={slotPickerPos}
                      onSelect={(org) => handleSlotSelect('planner', org)}
                      onGhostCreate={(name) => handleSlotGhostCreate('planner', name)}
                      onClear={plannerSt ? () => handleRemove(plannerSt.id) : undefined}
                      onClose={() => setActiveSlot(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* ── Archetype row ── */}
            {(!readOnly || eventArchetype) && <div className="stage-divider" />}
            {(!readOnly || eventArchetype) && (
              <div className="flex items-center gap-2 relative" data-header-picker ref={archetypeTriggerRef}>
                <p className={cn(fieldLabel, 'mb-0 shrink-0')}>Type</p>
                {eventArchetype ? (
                  readOnly ? (
                    <span className="stage-readout text-[var(--stage-text-secondary)] capitalize">
                      {eventArchetype.replace(/_/g, ' ')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleOpenArchetypePicker}
                      className="stage-readout text-[var(--stage-text-secondary)] px-2.5 py-1 capitalize hover:bg-[var(--stage-accent-muted)] transition-colors"
                      style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                    >
                      {eventArchetype.replace(/_/g, ' ')}
                    </button>
                  )
                ) : !readOnly ? (
                  <button
                    type="button"
                    onClick={handleOpenArchetypePicker}
                    className="stage-field-label px-2.5 py-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors flex items-center gap-1.5"
                    style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}
                  >
                    <Plus size={10} />
                    add type
                  </button>
                ) : null}
                {archetypePickerOpen && (
                  <ArchetypePickerPortal
                    position={scalarPickerPos}
                    eventArchetype={eventArchetype}
                    onChange={(val) => onSaveScalar?.({ event_archetype: val })}
                    onClose={() => setArchetypePickerOpen(false)}
                  />
                )}
              </div>
            )}
          </div>
        </StagePanel>
      </motion.div>

      {/* Contact picker sheet (company bill_to) */}
      <ClientContactPickerSheet
        open={contactSheetOpen}
        onOpenChange={setContactSheetOpen}
        pendingClientOrg={pendingClientOrg}
        roster={roster}
        rosterLoading={rosterLoading}
        adding={adding}
        onConfirm={handleConfirmBillTo}
      />

      {/* NetworkDetailSheet */}
      {sheetDetails && sourceOrgId && (
        <NetworkDetailSheet
          details={sheetDetails}
          sourceOrgId={sourceOrgId}
          onClose={() => setSheetDetails(null)}
          returnPath={crmReturnPath}
        />
      )}

      {/* CoupleEditSheet */}
      {coupleEdit && (
        <CoupleEditSheet
          open={coupleEdit.open}
          onOpenChange={(v) => !v && setCoupleEdit(null)}
          entityId={coupleEdit.entityId}
          initialValues={coupleEdit.initialValues}
          onSaved={() => {
            setCoupleEdit(null);
            onStakeholdersChange();
            router.refresh();
          }}
        />
      )}

      {/* IndividualEditSheet */}
      {individualEdit && (
        <IndividualEditSheet
          open={individualEdit.open}
          onOpenChange={(v) => !v && setIndividualEdit(null)}
          entityId={individualEdit.entityId}
          initialValues={individualEdit.initialValues}
          onSaved={() => {
            setIndividualEdit(null);
            onStakeholdersChange();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

'use client';

/**
 * DealHeaderStrip — the shared identity header at the top of both the
 * Deal lens and Plan lens. Renders the deal title, date/time, archetype,
 * client/venue/owner/planner stakeholders, and all associated inline
 * pickers. Heavy subcomponents (SlotPicker, scalar pickers, contact
 * sheet, identity row, stakeholder chip, edit sheets) live in sibling
 * files — see `deal-header-strip-*.tsx` for the breakdown.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, Eye, Plus, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { toast } from 'sonner';
import type { NetworkSearchOrg, NodeDetail } from '@/features/network-data';
import {
  addDealStakeholder,
  getOrgRosterForStakeholder,
  removeDealStakeholder,
  setPrimaryHost,
  setDayOfPoc,
  setDealPoc,
  type OrgRosterContact,
} from '../actions/deal-stakeholders';
import {
  createGhostPlannerEntity,
  createGhostPocEntity,
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
import {
  SlotPicker,
  type SlotType,
} from './deal-header-strip-slot-picker';
import {
  ArchetypePickerPortal,
  OwnerPickerPortal,
} from './deal-header-strip-scalar-pickers';
import { PeopleStrip, DealHeaderLegend } from './people-strip';
import { resolveDealHosts, type DealHost } from '../actions/resolve-deal-hosts';
import {
  EMPTY_VALUE_CLASS,
  FIELD_BLOCK_CLASS,
  FIELD_BLOCK_INTERACTIVE_CLASS,
  FIELD_LABEL_CLASS,
  type DealHeaderStripProps,
} from './deal-header-strip-shared';
import { StakeholderChip } from './deal-header-strip-stakeholder-chip';
import { DealHeaderIdentityRow } from './deal-header-strip-identity-row';
import { DealHeaderEditSheets } from './deal-header-strip-edit-sheets';

// Re-export for any callers that still import the props type from this file.
export type { DealHeaderStripProps } from './deal-header-strip-shared';

// =============================================================================
// Component
// =============================================================================

export function DealHeaderStrip({
  title,
  proposedDate,
  eventArchetype,
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
  const dayOfPocSt = stakeholders.find((s) => s.role === 'day_of_poc') ?? null;
  const dealPocSt = stakeholders.find((s) => s.role === 'deal_poc') ?? null;
  const hasLegacyClient = !billTo && !!client?.organization;

  // ── Hosts (P0 client-field redesign) ─────────────────────────────────────
  // resolveDealHosts returns the host-role rows for new deals, or synthesizes
  // partner chips from a legacy couple entity. Empty array → no hosts yet,
  // fall back to the bill_to / legacy client display.
  const [hosts, setHosts] = useState<DealHost[]>([]);
  useEffect(() => {
    let cancelled = false;
    resolveDealHosts(deal.id).then((rows) => {
      if (!cancelled) setHosts(rows);
    });
    return () => { cancelled = true; };
  }, [deal.id, stakeholders.length]);

  const primaryHost = hosts.find((h) => h.is_primary) ?? hosts[0] ?? null;
  // Bill-to is "secondary" only if it points at an entity different from the
  // primary host (e.g. parent company pays for the partners' wedding).
  const billToIsSeparate =
    billTo != null
    && primaryHost != null
    && (billTo.entity_id ?? billTo.organization_id) !== primaryHost.entity_id;
  // People strip renders hosts + secondary (standalone POCs, bill-to). Planner
  // is explicitly NOT in this list — it has its own dedicated slot below
  // the hosts strip, so surfacing it here would duplicate the person visually.
  // When the planner is also the POC (deal or day-of), the badge attaches to
  // the planner slot chip instead (see {deal}pocIsPlanner below).
  const pocRefId = dayOfPocSt
    ? dayOfPocSt.entity_id ?? dayOfPocSt.organization_id ?? null
    : null;
  const dealPocRefId = dealPocSt
    ? dealPocSt.entity_id ?? dealPocSt.organization_id ?? null
    : null;
  const plannerRefId = plannerSt
    ? plannerSt.entity_id ?? plannerSt.organization_id ?? null
    : null;
  const pocIsPlanner = !!pocRefId && pocRefId === plannerRefId;
  const dealPocIsPlanner = !!dealPocRefId && dealPocRefId === plannerRefId;
  const currentPocEntityId = pocRefId;
  const currentDealPocEntityId = dealPocRefId;

  const peopleStripSecondary = [
    // Surface each POC role in the hosts strip only when it isn't already
    // visible elsewhere (planner slot). If a POC = planner, the badge moves
    // to the planner slot so the person isn't drawn twice on the same card.
    // People-strip's own host-dedupe further collapses POC→host into a badge
    // on the host chip.
    ...(dealPocSt && !dealPocIsPlanner ? [{ role: 'deal_poc' as const, display: dealPocSt }] : []),
    ...(dayOfPocSt && !pocIsPlanner ? [{ role: 'day_of_poc' as const, display: dayOfPocSt }] : []),
    ...(billToIsSeparate && billTo ? [{ role: 'bill_to' as const, display: billTo }] : []),
  ];

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
      return;
    }
    // Notify parent so the prism bundle refetches — signals like "No owner"
    // depend on the bundle's deal data, not just local state. The
    // server-side revalidatePath('/productions') in assignDealOwner refreshes the
    // sidebar gigs list but doesn't reach the client-side TanStack cache.
    onStakeholdersChange();
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
      const role =
        slot === 'venue' ? 'venue_contact' :
        slot === 'poc'   ? 'day_of_poc' :
        /* slot === 'planner' */ 'planner';
      // POC is typically a person, so we pass the id as entity_id when the
      // picked result is a person. Planner can be a company, so it stays on
      // organization_id. Venue keeps the legacy organization_id path.
      const pickedId = org.entity_uuid ?? org.id;
      const isPerson = slot === 'poc' && org.entity_type === 'person';
      const result = await addDealStakeholder(deal.id, role, {
        ...(isPerson ? { entityId: pickedId } : { organizationId: pickedId }),
        isPrimary: false,
      });
      if (result.success) {
        toast.success(`${org.name} added.`);
        onStakeholdersChange();
      } else {
        toast.error(result.error);
      }
    },
    [deal.id, onStakeholdersChange, handleSelectClientOrg],
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
        } else {
          toast.error(result.error);
        }
        return;
      }
      const creator =
        slot === 'venue'   ? createGhostVenueEntity :
        slot === 'poc'     ? createGhostPocEntity :
        /* slot === 'planner' */ createGhostPlannerEntity;
      const entityId = await creator(name);
      if (!entityId) {
        toast.error('Failed to create entity');
        return;
      }
      setActiveSlot(null);
      const role =
        slot === 'venue' ? 'venue_contact' :
        slot === 'poc'   ? 'day_of_poc' :
        /* slot === 'planner' */ 'planner';
      // POC ghosts are person-type; planner/venue ghosts are company-type.
      const result = await addDealStakeholder(deal.id, role, {
        ...(slot === 'poc' ? { entityId } : { organizationId: entityId }),
        isPrimary: false,
      });
      if (result.success) {
        toast.success(`${name} added.`);
        onStakeholdersChange();
      } else {
        toast.error(result.error);
      }
    },
    [deal.id, onStakeholdersChange],
  );

  const handleRemove = async (stakeholderId: string) => {
    const result = await removeDealStakeholder(deal.id, stakeholderId);
    if (result.success) {
      onStakeholdersChange();
    } else {
      toast.error(result.error);
    }
  };

  const handleMakePrimaryHost = useCallback(
    async (stakeholderId: string) => {
      // Optimistic update: flip is_primary locally before the server action
      // commits so the star affordance feels immediate. Revert on failure.
      const snapshot = hosts;
      setHosts((prev) =>
        prev.map((h) => ({ ...h, is_primary: h.stakeholder_id === stakeholderId })),
      );
      const result = await setPrimaryHost(deal.id, stakeholderId);
      if (result.success) {
        toast.success('Primary host updated.');
        onStakeholdersChange();
      } else {
        setHosts(snapshot);
        toast.error(result.error);
      }
    },
    [deal.id, hosts, onStakeholdersChange],
  );

  // POC toggles: one shared helper that targets either the day_of_poc or
  // deal_poc role. When the caller's chip is already the active role, we
  // clear (pass null). Otherwise we set the role onto the given entity.
  // The server action replaces any existing row for that role.
  const runPocToggle = useCallback(
    async (
      role: 'day_of' | 'deal',
      target: {
        entityId?: string | null;
        organizationId?: string | null;
        currentlyActive: boolean;
      },
    ) => {
      const payload = target.currentlyActive
        ? null
        : {
            ...(target.entityId ? { entityId: target.entityId } : {}),
            ...(target.organizationId ? { organizationId: target.organizationId } : {}),
          };
      const result = role === 'day_of'
        ? await setDayOfPoc(deal.id, payload)
        : await setDealPoc(deal.id, payload);
      if (result.success) {
        const label = role === 'day_of' ? 'Day-of contact' : 'Deal contact';
        toast.success(target.currentlyActive ? `${label} cleared.` : `${label} updated.`);
        onStakeholdersChange();
      } else {
        toast.error(result.error);
      }
    },
    [deal.id, onStakeholdersChange],
  );

  const handleMakePoc = useCallback(
    (target: { entityId?: string | null; organizationId?: string | null; currentlyPoc: boolean }) =>
      runPocToggle('day_of', {
        entityId: target.entityId,
        organizationId: target.organizationId,
        currentlyActive: target.currentlyPoc,
      }),
    [runPocToggle],
  );

  const handleMakeDealPoc = useCallback(
    (target: { entityId?: string | null; organizationId?: string | null; currentlyPoc: boolean }) =>
      runPocToggle('deal', {
        entityId: target.entityId,
        organizationId: target.organizationId,
        currentlyActive: target.currentlyPoc,
      }),
    [runPocToggle],
  );

  // (currentPocEntityId / currentDealPocEntityId / dealPocIsPlanner are
  // derived earlier near the other stakeholder slot variables.)

  // ── Edit sheets ──────────────────────────────────────────────────────────
  const [sheetDetails, setSheetDetails] = useState<NodeDetail | null>(null);
  const selectedId = searchParams.get('selected');
  const streamMode = searchParams.get('stream') ?? 'inquiry';
  const crmReturnPath = selectedId ? `/productions?selected=${selectedId}&stream=${streamMode}` : '/productions';

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

  // Owner label resolves async via getEntityDisplayName. Returning null
  // during the resolve window (rather than a "Loading…" placeholder) avoids
  // a visible wave — the owner field stays empty for ~200ms then the name
  // appears, instead of "Loading…" flashing first. Same pattern used for
  // the activity timeline (User Advocate: "never show intermediate states").
  const ownerLabel = ownerEntityId && ownerName ? ownerName : null;

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
            <DealHeaderIdentityRow
              title={title}
              proposedDate={proposedDate}
              deal={deal}
              readOnly={readOnly}
              saving={saving}
              isEditable={isEditable}
              onTitleChange={onTitleChange}
              onSaveScalar={onSaveScalar}
              datePickerOpen={datePickerOpen}
              scalarPickerPos={scalarPickerPos}
              onOpenDatePicker={handleOpenDatePicker}
              onCloseDatePicker={() => setDatePickerOpen(false)}
              dateTriggerRef={dateTriggerRef}
            />

            <div className="stage-divider" />

            {/* Legend — documents every interactive icon used in the stakeholder
                chips below. Rendered only when there's at least one active
                affordance to describe; readOnly surfaces skip it entirely. */}
            {!readOnly && (
              <DealHeaderLegend
                showSwap
                showPrimary={hosts.length > 1}
                showDealPoc
                showDayOfPoc
              />
            )}

            {/* ── Stakeholder grid: 2×2 ── */}
            <div className="grid grid-cols-2 gap-2">
              {/* Client / Hosts — PeopleStrip handles its own chip clicks.
                  The outer fieldBlock only opens the client SlotPicker when
                  the slot is empty (no hosts + no legacy client yet), so
                  clicking a host chip no longer double-fires the picker. */}
              <div className="relative" data-header-picker ref={clientTriggerRef}>
                <div
                  className={cn(
                    FIELD_BLOCK_CLASS,
                    'w-full',
                    !readOnly && hosts.length === 0 && !hasLegacyClient && FIELD_BLOCK_INTERACTIVE_CLASS,
                  )}
                  onClick={
                    !readOnly && hosts.length === 0 && !hasLegacyClient
                      ? () => handleOpenSlot('client', clientTriggerRef)
                      : undefined
                  }
                >
                  <p className={FIELD_LABEL_CLASS}>{hosts.length > 1 ? 'Hosts' : 'Client'}</p>
                  {hosts.length > 0 ? (
                    <PeopleStrip
                      hosts={hosts}
                      secondary={peopleStripSecondary}
                      readOnly={readOnly}
                      onMakePrimary={handleMakePrimaryHost}
                      onMakePoc={(host) =>
                        handleMakePoc({
                          entityId: host.entity_type === 'person' ? host.entity_id : null,
                          organizationId: host.entity_type === 'company' ? host.entity_id : null,
                          currentlyPoc: currentPocEntityId === host.entity_id,
                        })
                      }
                      currentPocEntityId={currentPocEntityId}
                      onMakeDealPoc={(host) =>
                        handleMakeDealPoc({
                          entityId: host.entity_type === 'person' ? host.entity_id : null,
                          organizationId: host.entity_type === 'company' ? host.entity_id : null,
                          currentlyPoc: currentDealPocEntityId === host.entity_id,
                        })
                      }
                      currentDealPocEntityId={currentDealPocEntityId}
                    />
                  ) : billTo ? (
                    <StakeholderChip stakeholder={billTo} readOnly={readOnly} />
                  ) : hasLegacyClient ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Building2 className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
                      <span className="stage-readout truncate">{client!.organization.name}</span>
                    </div>
                  ) : (
                    <span className={EMPTY_VALUE_CLASS}>
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
                  className={cn(
                    FIELD_BLOCK_CLASS,
                    'w-full',
                    !readOnly && !venueSt && FIELD_BLOCK_INTERACTIVE_CLASS,
                  )}
                  onClick={
                    !readOnly && !venueSt
                      ? () => handleOpenSlot('venue', venueTriggerRef)
                      : undefined
                  }
                >
                  <p className={FIELD_LABEL_CLASS}>Venue</p>
                  {venueSt ? (
                    <StakeholderChip
                      stakeholder={venueSt}
                      readOnly={readOnly}
                      onSwap={!readOnly ? () => handleOpenSlot('venue', venueTriggerRef) : undefined}
                    />
                  ) : (
                    <span className={EMPTY_VALUE_CLASS}>
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
                  className={cn(FIELD_BLOCK_CLASS, 'w-full', !readOnly && FIELD_BLOCK_INTERACTIVE_CLASS)}
                  onClick={!readOnly ? handleOpenOwnerPicker : undefined}
                >
                  <p className={FIELD_LABEL_CLASS}>Owner</p>
                  {ownerLabel ? (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
                      <span className="stage-readout truncate">{ownerLabel}</span>
                    </div>
                  ) : ownerEntityId ? (
                    // Owner assigned but name still resolving — show just the
                    // icon as a quiet placeholder. No "Loading…" text flash.
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
                    </div>
                  ) : (
                    <span className={EMPTY_VALUE_CLASS}>
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
                  className={cn(
                    FIELD_BLOCK_CLASS,
                    'w-full',
                    !readOnly && !plannerSt && FIELD_BLOCK_INTERACTIVE_CLASS,
                  )}
                  onClick={
                    !readOnly && !plannerSt
                      ? () => handleOpenSlot('planner', plannerTriggerRef)
                      : undefined
                  }
                >
                  <p className={FIELD_LABEL_CLASS}>Planner</p>
                  {plannerSt ? (
                    <StakeholderChip
                      stakeholder={plannerSt}
                      readOnly={readOnly}
                      // No text badge — the filled icon in the pocActions
                      // group below communicates which role the planner holds.
                      pocActions={
                        !readOnly
                          ? {
                              deal: {
                                isActive: dealPocIsPlanner,
                                onToggle: () =>
                                  handleMakeDealPoc({
                                    entityId: plannerSt.entity_id,
                                    organizationId: plannerSt.organization_id,
                                    currentlyPoc: dealPocIsPlanner,
                                  }),
                              },
                              dayOf: {
                                isActive: pocIsPlanner,
                                onToggle: () =>
                                  handleMakePoc({
                                    entityId: plannerSt.entity_id,
                                    organizationId: plannerSt.organization_id,
                                    currentlyPoc: pocIsPlanner,
                                  }),
                              },
                            }
                          : undefined
                      }
                      onSwap={!readOnly ? () => handleOpenSlot('planner', plannerTriggerRef) : undefined}
                    />
                  ) : (
                    <span className={EMPTY_VALUE_CLASS}>
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
                <p className={cn(FIELD_LABEL_CLASS, 'mb-0 shrink-0')}>Type</p>
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

      <DealHeaderEditSheets
        contactSheetOpen={contactSheetOpen}
        onContactSheetOpenChange={setContactSheetOpen}
        pendingClientOrg={pendingClientOrg}
        roster={roster}
        rosterLoading={rosterLoading}
        adding={adding}
        onConfirmBillTo={handleConfirmBillTo}
        sheetDetails={sheetDetails}
        sourceOrgId={sourceOrgId}
        crmReturnPath={crmReturnPath}
        onSheetClose={() => setSheetDetails(null)}
        coupleEdit={coupleEdit}
        onCoupleEditClose={() => setCoupleEdit(null)}
        individualEdit={individualEdit}
        onIndividualEditClose={() => setIndividualEdit(null)}
        onStakeholdersChange={onStakeholdersChange}
      />
    </>
  );
}

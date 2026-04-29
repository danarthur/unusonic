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
  setPrimaryHost,
  setDayOfPoc,
  setDealPoc,
  type DealStakeholderDisplay,
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
import { PeopleStrip, DealHeaderLegend } from './people-strip';
import { resolveDealHosts, type DealHost } from '../actions/resolve-deal-hosts';

// =============================================================================
// Types
// =============================================================================

export type DealHeaderStripProps = {
  // Scalars managed by DealLens
  title: string | null;
  proposedDate: string | null;
  eventArchetype: string | null;
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
    // server-side revalidatePath('/crm') in assignDealOwner refreshes the
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

  const renderStakeholderChip = (
    s: DealStakeholderDisplay,
    extraBadge?: string,
    pocActions?: {
      dayOf?: { isActive: boolean; onToggle: () => void };
      deal?: { isActive: boolean; onToggle: () => void };
    },
    onSwap?: () => void,
  ) => {
    // Navigate to the filled-chip's entity or the organization that owns the
    // stakeholder row. This is what a body-click on the chip triggers —
    // clicking the chip name goes to that person/org's network detail.
    const navigateTargetId = s.entity_id ?? s.organization_id ?? null;
    const goToEntity = (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (navigateTargetId) {
        router.push(`/network?selected=${encodeURIComponent(navigateTargetId)}`);
      }
    };
    const roleToggleButton = (
      label: string,
      isActive: boolean,
      onToggle: () => void,
      iconPath: React.ReactNode,
    ) => (
      <button
        type="button"
        onClick={(e) => {
          // The outer fieldBlock div listens for clicks to open the
          // SlotPicker. Swallow the event so toggling a role doesn't
          // also pop the picker.
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          'shrink-0 inline-flex items-center justify-center size-5 rounded-sm',
          'opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity',
          'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
          isActive && 'opacity-100 text-[var(--stage-text-primary)]',
        )}
        aria-label={label}
        title={label}
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={isActive ? 2 : 1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {iconPath}
        </svg>
      </button>
    );
    // Body of the chip is a button that navigates to the entity when there
    // IS an entity to navigate to. Falls back to a plain div when not
    // clickable (missing entity reference).
    const chipBody = (
      <>
        <EntityIcon
          entityType={s.entity_type}
          className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0"
        />
        <span className="stage-readout truncate">{s.name}</span>
        {extraBadge && (
          <span className="text-[length:var(--stage-label-size,11px)] text-[var(--stage-text-tertiary)] uppercase tracking-wide shrink-0">
            {extraBadge}
          </span>
        )}
      </>
    );
    const bodyClasses = 'inline-flex items-center gap-1.5 min-w-0 min-w-0 text-left';
    return (
      <div className="group flex items-center gap-1 min-w-0">
        {navigateTargetId && !readOnly ? (
          <button
            type="button"
            onClick={goToEntity}
            className={cn(
              bodyClasses,
              'rounded-[var(--stage-radius-input,6px)] hover:text-[var(--stage-text-primary)] transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
            )}
            title="View in network"
          >
            {chipBody}
          </button>
        ) : (
          <div className={bodyClasses}>{chipBody}</div>
        )}
        {pocActions?.deal &&
          roleToggleButton(
            pocActions.deal.isActive ? 'Clear deal contact' : 'Make deal contact',
            pocActions.deal.isActive,
            pocActions.deal.onToggle,
            // lucide MessageSquare path
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
          )}
        {pocActions?.dayOf &&
          roleToggleButton(
            pocActions.dayOf.isActive ? 'Clear day-of contact' : 'Make day-of contact',
            pocActions.dayOf.isActive,
            pocActions.dayOf.onToggle,
            // lucide Phone path
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
          )}
        {onSwap &&
          roleToggleButton(
            'Swap',
            false,
            onSwap,
            // lucide Replace (two overlapping rounded squares with an arrow
            // implied by the offset) — drawn as a simplified swap glyph.
            <>
              <path d="M14 4c0-1.1.9-2 2-2" />
              <path d="M20 2c1.1 0 2 .9 2 2" />
              <path d="M22 8c0 1.1-.9 2-2 2" />
              <path d="M16 10c-1.1 0-2-.9-2-2" />
              <path d="m3 7 3 3 3-3" />
              <path d="M6 10V5c0-.55.45-1 1-1h6" />
              <path d="m21 17-3-3-3 3" />
              <path d="M18 14v5c0 .55-.45 1-1 1h-6" />
            </>,
          )}
      </div>
    );
  };

  // Owner label resolves async via getEntityDisplayName. Returning null
  // during the resolve window (rather than a "Loading…" placeholder) avoids
  // a visible wave — the owner field stays empty for ~200ms then the name
  // appears, instead of "Loading…" flashing first. Same pattern used for
  // the activity timeline (User Advocate: "never show intermediate states").
  const ownerLabel = ownerEntityId && ownerName ? ownerName : null;

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
                    fieldBlock,
                    'w-full',
                    !readOnly && hosts.length === 0 && !hasLegacyClient && fieldBlockInteractive,
                  )}
                  onClick={
                    !readOnly && hosts.length === 0 && !hasLegacyClient
                      ? () => handleOpenSlot('client', clientTriggerRef)
                      : undefined
                  }
                >
                  <p className={fieldLabel}>{hosts.length > 1 ? 'Hosts' : 'Client'}</p>
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
                  className={cn(
                    fieldBlock,
                    'w-full',
                    !readOnly && !venueSt && fieldBlockInteractive,
                  )}
                  onClick={
                    !readOnly && !venueSt
                      ? () => handleOpenSlot('venue', venueTriggerRef)
                      : undefined
                  }
                >
                  <p className={fieldLabel}>Venue</p>
                  {venueSt ? (
                    renderStakeholderChip(
                      venueSt,
                      undefined,
                      undefined,
                      !readOnly ? () => handleOpenSlot('venue', venueTriggerRef) : undefined,
                    )
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
                  ) : ownerEntityId ? (
                    // Owner assigned but name still resolving — show just the
                    // icon as a quiet placeholder. No "Loading…" text flash.
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
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
                  className={cn(
                    fieldBlock,
                    'w-full',
                    !readOnly && !plannerSt && fieldBlockInteractive,
                  )}
                  onClick={
                    !readOnly && !plannerSt
                      ? () => handleOpenSlot('planner', plannerTriggerRef)
                      : undefined
                  }
                >
                  <p className={fieldLabel}>Planner</p>
                  {plannerSt ? (
                    renderStakeholderChip(
                      plannerSt,
                      // No text badge — the filled icon in the pocActions
                      // group below communicates which role the planner holds.
                      undefined,
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
                        : undefined,
                      !readOnly ? () => handleOpenSlot('planner', plannerTriggerRef) : undefined,
                    )
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
          }}
        />
      )}
    </>
  );
}

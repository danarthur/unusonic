'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, MapPin, Building2, Plus, X, Loader2, Eye } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { StagePanel } from '@/shared/ui/stage-panel';
import { TimePicker } from '@/shared/ui/time-picker';
import { formatTime12h } from '@/shared/lib/parse-time';
import { STAGE_MEDIUM, STAGE_LIGHT } from '@/shared/lib/motion-constants';

import { NetworkDetailSheet } from '@/widgets/network-detail';
import type { NetworkSearchOrg, NodeDetail } from '@/features/network-data';
import { searchNetworkOrgs } from '@/features/network-data';
import { toast } from 'sonner';
import {
  addDealStakeholder,
  removeDealStakeholder,
  getOrgRosterForStakeholder,
  type DealStakeholderDisplay,
  type OrgRosterContact,
} from '../actions/deal-stakeholders';
import { createGhostVenueEntity, createGhostPlannerEntity, getEntityDisplayName } from '../actions/lookup';
import { searchReferrerEntities } from '../actions/search-referrer';
import { getWorkspaceMembersForPicker, type WorkspaceMemberOption } from '../actions/get-workspace-members';
import { assignDealOwner } from '../actions/update-deal-status';
import {
  getNodeForSheet,
  getCoupleEntityForEdit,
  getIndividualEntityForEdit,
  type CoupleEntityForEdit,
  type IndividualEntityForEdit,
} from '../actions/get-node-for-sheet';
import { CoupleEditSheet } from './couple-edit-sheet';
import { IndividualEditSheet } from './individual-edit-sheet';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import type { DealDetail } from '../actions/get-deal';
import type { DealClientContext } from '../actions/get-deal-client';

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
  onSaveScalar?: (patch: { proposed_date?: string | null; event_archetype?: string | null; budget_estimated?: number | null; event_start_time?: string | null; event_end_time?: string | null }) => void;
  // Stakeholders (client, venue, owner, planner)
  deal: DealDetail;
  stakeholders: DealStakeholderDisplay[];
  client: DealClientContext | null;
  sourceOrgId: string | null;
  onStakeholdersChange: () => void;
};

// =============================================================================
// Status helpers
// =============================================================================

// =============================================================================
// Formatters
// =============================================================================

function formatDate(iso: string): string {
  // Parse yyyy-MM-dd as local date — new Date('yyyy-MM-dd') is UTC midnight and shifts back a day in western timezones
  const parts = iso.split('-');
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// =============================================================================
// Entity icon
// =============================================================================

/** Controlled date input that avoids the uncontrolled→controlled React warning. */
function DateInputControlled({
  initialValue,
  onChangeDate,
  onEscape,
}: {
  initialValue: string | null;
  onChangeDate: (val: string | null) => void;
  onEscape: () => void;
}) {
  const [val, setVal] = useState(initialValue ?? '');
  return (
    <input
      type="date"
      value={val}
      className="stage-input"
      style={{
        background: 'var(--stage-surface-elevated)',
        boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top)',
        border: '1px solid var(--stage-edge-subtle)',
      }}
      autoFocus
      onChange={(e) => {
        setVal(e.target.value);
        onChangeDate(e.target.value || null);
      }}
      onKeyDown={(e) => { if (e.key === 'Escape') onEscape(); }}
    />
  );
}

function EntityIcon({ entityType, className }: { entityType: string | null | undefined; className?: string }) {
  const cls = cn('shrink-0', className ?? 'size-3');
  if (entityType === 'person' || entityType === 'couple') return <User className={cls} />;
  if (entityType === 'venue') return <MapPin className={cls} />;
  return <Building2 className={cls} />;
}

// =============================================================================
// SlotPicker — inline search popover for venue / planner
// =============================================================================

type SlotType = 'venue' | 'planner' | 'client';

const SLOT_META: Record<SlotType, { entityTypeFilter?: string; ghostLabel: string }> = {
  venue: { entityTypeFilter: 'venue', ghostLabel: 'Add as venue' },
  planner: { ghostLabel: 'Add as planner' },
  client: { ghostLabel: 'Add as client' },
};

function SlotPicker({
  sourceOrgId,
  slot,
  onSelect,
  onGhostCreate,
  onClear,
  onClose,
  triggerRect,
}: {
  sourceOrgId: string;
  slot: SlotType;
  onSelect: (org: NetworkSearchOrg) => void;
  onGhostCreate: (name: string) => Promise<void>;
  onClear?: () => void;
  onClose: () => void;
  triggerRect: { top: number; left: number } | null;
}) {
  const { entityTypeFilter, ghostLabel } = SLOT_META[slot];
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NetworkSearchOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 1) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      if (slot === 'planner') {
        // Planner search: use full network + employee expansion
        const refs = await searchReferrerEntities(q);
        setResults(refs.map((r) => ({
          id: r.id,
          entity_uuid: r.id,
          name: r.subtitle ? `${r.name}` : r.name,
          entity_type: r.subtitle ? 'person' : 'company',
          _source: r.section === 'team' ? 'connection' as const : 'global' as const,
          _subtitle: r.subtitle,
        } as NetworkSearchOrg & { _subtitle?: string | null })));
      } else {
        const r = await searchNetworkOrgs(sourceOrgId, q, entityTypeFilter ? { entityType: entityTypeFilter } : undefined);
        setResults(r);
      }
      setLoading(false);
    }, 250);
  }, [sourceOrgId, entityTypeFilter, slot]);

  const handleGhostCreate = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    await onGhostCreate(name);
    setCreating(false);
  };

  if (!triggerRect) return null;

  return createPortal(
    <motion.div
      data-header-picker
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={STAGE_LIGHT}
      className="fixed z-50 w-64 overflow-hidden"
      style={{
        top: triggerRect.top,
        left: triggerRect.left,
        background: 'var(--stage-surface-raised)',
        borderRadius: 'var(--stage-radius-panel, 12px)',
        boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 16px 48px oklch(0 0 0 / 0.7)',
      }}
    >
      {onClear && (
        <button type="button" onClick={() => { onClear(); onClose(); }}
          className="w-full text-left px-4 py-2 stage-label text-[var(--stage-text-tertiary)] hover:bg-[var(--stage-accent-muted)] transition-colors border-b border-[oklch(1_0_0_/_0.06)]">
          Remove
        </button>
      )}
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Search network…"
        className="w-full bg-transparent px-4 py-3 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] border-b border-[oklch(1_0_0_/_0.06)]"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
      {loading && (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="size-3.5 animate-spin text-[var(--stage-text-tertiary)]" />
        </div>
      )}
      {!loading && results.map((r) => {
        const sub = (r as NetworkSearchOrg & { _subtitle?: string | null })._subtitle;
        return (
          <button
            key={r.entity_uuid ?? r.id}
            type="button"
            onClick={() => onSelect(r)}
            className="w-full text-left px-4 py-2.5 text-sm text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)] hover:text-[var(--stage-text-primary)] transition-colors flex items-center gap-2.5 min-w-0"
          >
            <EntityIcon entityType={r.entity_type} />
            <span className="truncate flex items-baseline gap-1.5 min-w-0">
              <span className="truncate">{r.name}</span>
              {sub && <span className="text-xs text-[var(--stage-text-tertiary)] shrink-0">{sub}</span>}
            </span>
          </button>
        );
      })}
      {!loading && query.trim().length >= 2 && (
        <button
          type="button"
          disabled={creating}
          onClick={handleGhostCreate}
          className="w-full text-left px-4 py-2.5 text-sm text-[var(--stage-text-primary)] hover:bg-[var(--stage-accent-muted)] transition-colors flex items-center gap-2 border-t border-[oklch(1_0_0_/_0.06)] disabled:opacity-45"
        >
          {creating ? <Loader2 className="size-3.5 animate-spin shrink-0" /> : <Plus size={14} className="shrink-0" />}
          {ghostLabel} &ldquo;{query.trim()}&rdquo;
        </button>
      )}
    </motion.div>,
    document.body
  );
}

// =============================================================================
// Component
// =============================================================================

export function DealHeaderStrip({
  title,
  proposedDate,
  eventArchetype,
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

  // Inline scalar pickers (date, archetype) — portaled to body
  const dateTriggerRef = useRef<HTMLButtonElement>(null);
  const archetypeTriggerRef = useRef<HTMLDivElement>(null);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [archetypePickerOpen, setArchetypePickerOpen] = useState(false);
  const [scalarPickerPos, setScalarPickerPos] = useState({ top: 0, left: 0, maxLeft: 0 });

  /** Position a dropdown anchored to a trigger, clamped to viewport right edge */
  const openPickerAt = (ref: React.RefObject<HTMLElement | null>, dropdownWidth: number) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - dropdownWidth - 16; // 16px margin from right edge
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

  // Derive slots
  const billTo = stakeholders.find((s) => s.role === 'bill_to') ?? null;
  const venueSt = stakeholders.find((s) => s.role === 'venue_contact') ?? null;
  const plannerSt = stakeholders.find((s) => s.role === 'planner') ?? null;
  const hasLegacyClient = !billTo && !!client?.organization;

  // ── Owner ──
  const [ownerEntityId, setOwnerEntityId] = useState<string | null>(deal.owner_entity_id ?? null);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [ownerPickerPos, setOwnerPickerPos] = useState({ top: 0, left: 0 });
  const ownerTriggerRef = useRef<HTMLDivElement>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMemberOption[]>([]);
  const [showAllMembers, setShowAllMembers] = useState(false);

  useEffect(() => { setOwnerEntityId(deal.owner_entity_id ?? null); }, [deal.id]);

  // Resolve owner name on mount / when owner changes
  useEffect(() => {
    if (!ownerEntityId) { setOwnerName(null); return; }
    // Check if already in loaded members list
    const cached = workspaceMembers.find((m) => m.entity_id === ownerEntityId);
    if (cached) { setOwnerName(cached.display_name); return; }
    getEntityDisplayName(ownerEntityId).then((name) => setOwnerName(name ?? 'Assigned'));
  }, [ownerEntityId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const salesMembers = workspaceMembers.filter((m) => m.is_sales);
  const hasSalesMembers = salesMembers.length > 0;
  const visibleMembers = showAllMembers || !hasSalesMembers ? workspaceMembers : salesMembers;

  const handleAssignOwner = async (entityId: string | null) => {
    const name = entityId ? workspaceMembers.find((m) => m.entity_id === entityId)?.display_name ?? null : null;
    setOwnerEntityId(entityId);
    setOwnerName(name);
    setOwnerPickerOpen(false);
    const result = await assignDealOwner(deal.id, entityId);
    if (!result.success) {
      setOwnerEntityId(deal.owner_entity_id);
      setOwnerName(null); // will re-resolve via effect
      toast.error(result.error ?? 'Failed to assign owner');
    }
  };

  // ── Client (bill_to) ──
  const [pendingClientOrg, setPendingClientOrg] = useState<NetworkSearchOrg | null>(null);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [roster, setRoster] = useState<OrgRosterContact[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  const handleSelectClientOrg = (org: NetworkSearchOrg) => {
    setPendingClientOrg(org);
    setActiveSlot(null);
    const isCompany = !org.entity_type || org.entity_type === 'company' || org.entity_type === 'venue_company';
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
  };

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

  // ── Slot pickers (venue / planner / client) ──
  const [activeSlot, setActiveSlot] = useState<SlotType | null>(null);
  const [slotPickerPos, setSlotPickerPos] = useState<{ top: number; left: number } | null>(null);
  const clientTriggerRef = useRef<HTMLDivElement>(null);
  const venueTriggerRef = useRef<HTMLDivElement>(null);
  const plannerTriggerRef = useRef<HTMLDivElement>(null);

  const handleOpenSlot = (slot: SlotType, ref: React.RefObject<HTMLDivElement | null>) => {
    if (activeSlot === slot) { setActiveSlot(null); return; }
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setSlotPickerPos({ top: rect.bottom + 6, left: rect.left });
    }
    setActiveSlot(slot);
  };

  const handleSlotSelect = useCallback(async (slot: SlotType, org: NetworkSearchOrg) => {
    setActiveSlot(null);
    if (slot === 'client') {
      // Client uses the existing company-vs-person flow
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
  }, [deal.id, onStakeholdersChange, router]);

  const handleSlotGhostCreate = useCallback(async (slot: SlotType, name: string) => {
    if (slot === 'client') {
      // Ghost client creation — create company entity, then add as bill_to
      const { createGhostClientEntity } = await import('../actions/lookup');
      const entityId = await createGhostClientEntity(name);
      if (!entityId) { toast.error('Failed to create client'); return; }
      setActiveSlot(null);
      const result = await addDealStakeholder(deal.id, 'bill_to', { organizationId: entityId, isPrimary: true });
      if (result.success) { toast.success(`${name} added as client.`); onStakeholdersChange(); router.refresh(); }
      else toast.error(result.error);
      return;
    }
    const creator = slot === 'venue' ? createGhostVenueEntity : createGhostPlannerEntity;
    const entityId = await creator(name);
    if (!entityId) { toast.error('Failed to create entity'); return; }
    setActiveSlot(null);
    const role = slot === 'venue' ? 'venue_contact' : 'planner';
    const result = await addDealStakeholder(deal.id, role, { organizationId: entityId, isPrimary: false });
    if (result.success) {
      toast.success(`${name} added.`);
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }, [deal.id, onStakeholdersChange, router]);

  const handleRemove = async (stakeholderId: string) => {
    const result = await removeDealStakeholder(deal.id, stakeholderId);
    if (result.success) {
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  // ── Edit sheets ──
  const [sheetDetails, setSheetDetails] = useState<NodeDetail | null>(null);
  const [loadingRelId, setLoadingRelId] = useState<string | null>(null);
  const selectedId = searchParams.get('selected');
  const streamMode = searchParams.get('stream') ?? 'inquiry';
  const crmReturnPath = selectedId ? `/crm?selected=${selectedId}&stream=${streamMode}` : '/crm';

  const handleEditClick = async (relationshipId: string) => {
    setLoadingRelId(relationshipId);
    const details = await getNodeForSheet(relationshipId);
    setLoadingRelId(null);
    if (details) setSheetDetails(details);
  };

  const [coupleEdit, setCoupleEdit] = useState<{ open: boolean; entityId: string; initialValues: CoupleEntityForEdit } | null>(null);
  const [loadingCoupleId, setLoadingCoupleId] = useState<string | null>(null);

  const handleCoupleEditClick = async (entityId: string) => {
    setLoadingCoupleId(entityId);
    const data = await getCoupleEntityForEdit(entityId);
    setLoadingCoupleId(null);
    if (data) setCoupleEdit({ open: true, entityId, initialValues: data });
    else toast.error('Could not load couple details.');
  };

  const [individualEdit, setIndividualEdit] = useState<{ open: boolean; entityId: string; initialValues: IndividualEntityForEdit } | null>(null);
  const [loadingIndividualId, setLoadingIndividualId] = useState<string | null>(null);

  const handleIndividualEditClick = async (entityId: string) => {
    setLoadingIndividualId(entityId);
    const data = await getIndividualEntityForEdit(entityId);
    setLoadingIndividualId(null);
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

  // Note: handleEditClick, handleCoupleEditClick, handleIndividualEditClick are still
  // defined above and referenced by the Sheet components at the bottom of this file.
  // The inline edit buttons were removed — entity fields now use click-to-swap pattern.

  const renderStakeholderChip = (s: DealStakeholderDisplay) => {
    const entityId = s.organization_id;
    return (
      <div className="flex items-center gap-1.5 min-w-0">
        <EntityIcon entityType={s.entity_type} className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
        <span className="stage-readout truncate">{s.name}</span>
        {entityId && (
          <a
            href={`/network/entity/${entityId}?kind=external_partner`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-0.5 rounded-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
            title="View in network"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
        )}
      </div>
    );
  };

  const ownerLabel = ownerEntityId ? (ownerName ?? 'Loading…') : null;

  // Field-on-surface pattern: labels + values sit directly on the panel.
  // No nested cards. Spatial grouping and labels provide structure.
  // Editable fields get a bottom-border (LCD well pattern).
  const fieldLabel = "stage-label text-[var(--stage-text-tertiary)] mb-1 select-none leading-none";
  const emptyValue = "stage-field-label text-[var(--stage-text-tertiary)] flex items-center gap-1.5";
  const fieldBlock = "px-3 py-2.5 min-w-0";
  const fieldBlockInteractive = "cursor-pointer [border-radius:var(--stage-radius-input,6px)] hover:bg-[var(--stage-accent-muted)] transition-colors";

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={STAGE_MEDIUM}
      >
        <StagePanel elevated className={cn("p-5", readOnly && "pointer-events-none opacity-45")}>
          <div className="flex items-center justify-between mb-4">
            <p className="stage-label">
              Deal
            </p>
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

          {/* ── Row 0: Title block + Date block ── */}
          <div className="flex items-start gap-2 min-w-0">

          {/* Title block */}
          <div className={cn(
            fieldBlock, "flex-1 group",
            isEditable && fieldBlockInteractive,
          )}>
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
              <span className="text-micro text-[var(--stage-text-tertiary)] tracking-wide mt-1 block">Saving…</span>
            )}
          </div>

          {/* Date block */}
          <div className="relative" data-header-picker>
            <button
              ref={dateTriggerRef}
              type="button"
              onClick={!readOnly ? handleOpenDatePicker : undefined}
              disabled={readOnly}
              className={cn(
                fieldBlock, "text-left shrink-0",
                !readOnly && fieldBlockInteractive,
              )}
            >
              <p className={fieldLabel}>Date</p>
              {proposedDate ? (
                <span className="stage-readout whitespace-nowrap">
                  {formatDate(proposedDate)}
                </span>
              ) : (
                <span className={cn(emptyValue, "whitespace-nowrap")}>
                  {!readOnly ? <><Plus size={9} />add</> : '—'}
                </span>
              )}
            </button>
            {datePickerOpen && createPortal(
              <motion.div
                data-header-picker
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={STAGE_LIGHT}
                className="fixed z-50"
                style={{
                  top: scalarPickerPos.top,
                  left: scalarPickerPos.left,
                  background: 'var(--stage-surface-raised)',
                  borderRadius: 'var(--stage-radius-panel, 12px)',
                  boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), inset 1px 0 0 0 var(--stage-edge-left), 0 16px 48px oklch(0 0 0 / 0.7)',
                  padding: 'var(--stage-padding, 16px)',
                }}
              >
                <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>Show date</p>
                <DateInputControlled
                  initialValue={proposedDate}
                  onChangeDate={(val) => onSaveScalar?.({ proposed_date: val })}
                  onEscape={() => setDatePickerOpen(false)}
                />
                <div className="flex items-center justify-between" style={{ marginTop: 'var(--stage-gap-wide, 12px)', gap: 'var(--stage-gap, 6px)' }}>
                  {proposedDate && (
                    <button
                      type="button"
                      onClick={() => {
                        onSaveScalar?.({ proposed_date: null });
                        setDatePickerOpen(false);
                      }}
                      className="stage-label transition-colors"
                      style={{ color: 'var(--stage-text-tertiary)' }}
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDatePickerOpen(false)}
                    className="stage-btn stage-btn-ghost ml-auto"
                  >
                    Done
                  </button>
                </div>
              </motion.div>,
              document.body
            )}
          </div>

          {/* Time block */}
          <div className={cn(fieldBlock, "shrink-0")}>
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
                  ? `${formatTime12h(deal.event_start_time)}${deal.event_end_time ? ` – ${formatTime12h(deal.event_end_time)}` : ''}`
                  : '—'}
              </span>
            )}
          </div>

        </div>

        {/* ── Divider ── */}
        <div className="stage-divider" />

        {/* ── Stakeholder grid: 2×2 ── */}
        <div className="grid grid-cols-2 gap-2">

          {/* Client */}
          <div className="relative" data-header-picker ref={clientTriggerRef}>
            <div
              className={cn(fieldBlock, "w-full", !readOnly && fieldBlockInteractive)}
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
                  {!readOnly ? <><Plus size={9} />add</> : '—'}
                </span>
              )}
            </div>
            <AnimatePresence>
              {activeSlot === 'client' && sourceOrgId && (
                <SlotPicker sourceOrgId={sourceOrgId} slot="client"
                  triggerRect={slotPickerPos}
                  onSelect={(org) => handleSlotSelect('client', org)}
                  onGhostCreate={(name) => handleSlotGhostCreate('client', name)}
                  onClear={billTo ? () => handleRemove(billTo.id) : undefined}
                  onClose={() => setActiveSlot(null)} />
              )}
            </AnimatePresence>
          </div>

          {/* Venue */}
          <div className="relative" data-header-picker ref={venueTriggerRef}>
            <div
              className={cn(fieldBlock, "w-full", !readOnly && fieldBlockInteractive)}
              onClick={!readOnly ? () => handleOpenSlot('venue', venueTriggerRef) : undefined}
            >
              <p className={fieldLabel}>Venue</p>
              {venueSt ? (
                renderStakeholderChip(venueSt)
              ) : (
                <span className={emptyValue}>
                  {!readOnly ? <><Plus size={9} />add</> : '—'}
                </span>
              )}
            </div>
            <AnimatePresence>
              {activeSlot === 'venue' && sourceOrgId && (
                  <SlotPicker sourceOrgId={sourceOrgId} slot="venue"
                    triggerRect={slotPickerPos}
                    onSelect={(org) => handleSlotSelect('venue', org)}
                    onGhostCreate={(name) => handleSlotGhostCreate('venue', name)}
                    onClear={venueSt ? () => handleRemove(venueSt.id) : undefined}
                    onClose={() => setActiveSlot(null)} />
              )}
            </AnimatePresence>
          </div>

          {/* Owner */}
          <div className="relative" data-header-picker ref={ownerTriggerRef}>
            <div
              className={cn(fieldBlock, "w-full", !readOnly && fieldBlockInteractive)}
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
                  {!readOnly ? <><Plus size={9} />assign</> : '—'}
                </span>
              )}
            </div>
            {ownerPickerOpen && workspaceMembers.length > 0 && createPortal(
                <motion.div
                  key="owner-picker"
                  data-header-picker
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={STAGE_LIGHT}
                  className="fixed z-50 min-w-[200px] overflow-hidden"
                  style={{
                    top: ownerPickerPos.top,
                    left: ownerPickerPos.left,
                    background: 'var(--stage-surface-raised)',
                    borderRadius: 'var(--stage-radius-panel, 12px)',
                    boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 16px 48px oklch(0 0 0 / 0.7)',
                  }}
                >
                  {ownerEntityId && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); handleAssignOwner(null); }}
                      className="w-full text-left px-4 py-2 stage-label text-[var(--stage-text-tertiary)] hover:bg-[var(--stage-accent-muted)] transition-colors border-b border-[oklch(1_0_0_/_0.06)]">
                      Remove
                    </button>
                  )}
                  {visibleMembers.map((m) => (
                    <button key={m.entity_id} type="button"
                      onClick={(e) => { e.stopPropagation(); handleAssignOwner(m.entity_id); }}
                      className={cn(
                        'w-full text-left px-4 py-2.5 text-sm tracking-tight transition-colors flex items-center gap-2.5',
                        m.entity_id === ownerEntityId ? 'text-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.04)]' : 'text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)]',
                      )}>
                      {m.display_name}
                      {m.entity_id === ownerEntityId && <span className="stage-label ml-auto shrink-0" style={{ color: 'var(--stage-text-tertiary)' }}>current</span>}
                    </button>
                  ))}
                  {hasSalesMembers && !showAllMembers && workspaceMembers.length > salesMembers.length && (
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); setShowAllMembers(true); }}
                      className="w-full text-left px-4 py-2 stage-label text-field-label text-[var(--stage-text-tertiary)] hover:bg-[var(--stage-accent-muted)] transition-colors border-t border-[oklch(1_0_0_/_0.06)]">
                      Show all team
                    </button>
                  )}
                </motion.div>,
              document.body
            )}
          </div>

          {/* Planner */}
          <div className="relative" data-header-picker ref={plannerTriggerRef}>
            <div
              className={cn(fieldBlock, "w-full", !readOnly && fieldBlockInteractive)}
              onClick={!readOnly ? () => handleOpenSlot('planner', plannerTriggerRef) : undefined}
            >
              <p className={fieldLabel}>Planner</p>
              {plannerSt ? (
                renderStakeholderChip(plannerSt)
              ) : (
                <span className={emptyValue}>
                  {!readOnly ? <><Plus size={9} />add</> : '—'}
                </span>
              )}
            </div>
            <AnimatePresence>
              {activeSlot === 'planner' && sourceOrgId && (
                  <SlotPicker sourceOrgId={sourceOrgId} slot="planner"
                    triggerRect={slotPickerPos}
                    onSelect={(org) => handleSlotSelect('planner', org)}
                    onGhostCreate={(name) => handleSlotGhostCreate('planner', name)}
                    onClear={plannerSt ? () => handleRemove(plannerSt.id) : undefined}
                    onClose={() => setActiveSlot(null)} />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ── Archetype — slim labeled row ── */}
        {(!readOnly || eventArchetype) && <div className="stage-divider" />}
        {(!readOnly || eventArchetype) && (
          <div className="flex items-center gap-2 relative" data-header-picker ref={archetypeTriggerRef}>
            <p className={cn(fieldLabel, "mb-0 shrink-0")}>Type</p>
            {eventArchetype ? (
              readOnly ? (
                <span className="stage-readout text-[var(--stage-text-secondary)] capitalize">{eventArchetype.replace(/_/g, ' ')}</span>
              ) : (
                <button type="button" onClick={handleOpenArchetypePicker}
                  className="stage-readout text-[var(--stage-text-secondary)] px-2.5 py-1 capitalize hover:bg-[var(--stage-accent-muted)] transition-colors"
                  style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}>
                  {eventArchetype.replace(/_/g, ' ')}
                </button>
              )
            ) : !readOnly ? (
              <button type="button" onClick={handleOpenArchetypePicker}
                className="stage-field-label px-2.5 py-1 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors flex items-center gap-1.5"
                style={{ borderRadius: 'var(--stage-radius-input, 6px)' }}>
                <Plus size={10} />add type
              </button>
            ) : null}
            {archetypePickerOpen && createPortal(
              <motion.div
                data-header-picker
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={STAGE_LIGHT}
                className="fixed z-50 overflow-hidden max-h-[320px] overflow-y-auto"
                style={{
                  top: scalarPickerPos.top,
                  left: scalarPickerPos.left,
                  background: 'var(--stage-surface-raised)',
                  borderRadius: 'var(--stage-radius-panel, 12px)',
                  boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), inset 1px 0 0 0 var(--stage-edge-left), 0 16px 48px oklch(0 0 0 / 0.7)',
                  padding: 'var(--stage-padding, 16px)',
                  minWidth: 200,
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'oklch(1 0 0 / 0.10) transparent',
                }}
              >
                <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}>Show type</p>
                <div className="flex flex-col" style={{ gap: '2px' }}>
                  {(['wedding', 'corporate_gala', 'product_launch', 'private_dinner', 'concert', 'festival', 'awards_show', 'conference', 'birthday', 'charity_gala'] as const).map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => {
                        onSaveScalar?.({ event_archetype: a });
                        setArchetypePickerOpen(false);
                      }}
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-sm capitalize transition-colors',
                        eventArchetype === a ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
                      )}
                      style={{
                        borderRadius: 'var(--stage-radius-input, 6px)',
                        background: eventArchetype === a ? 'color-mix(in oklch, var(--stage-accent) 8%, transparent)' : 'transparent',
                      }}
                    >{a.replace(/_/g, ' ')}</button>
                  ))}
                  {eventArchetype && (
                    <button
                      type="button"
                      onClick={() => { onSaveScalar?.({ event_archetype: null }); setArchetypePickerOpen(false); }}
                      className="w-full text-left px-3 py-1.5 stage-label transition-colors"
                      style={{ color: 'var(--stage-text-tertiary)', marginTop: 'var(--stage-gap, 6px)', paddingTop: 'var(--stage-gap, 6px)', borderTop: '1px solid var(--stage-edge-subtle)' }}
                    >Clear</button>
                  )}
                </div>
              </motion.div>,
              document.body
            )}
          </div>
        )}

          </div>
        </StagePanel>
      </motion.div>

      {/* OmniSearch removed — client now uses SlotPicker like all other entity fields */}

      {/* Contact picker sheet (for company bill_to) */}
      <Sheet open={contactSheetOpen} onOpenChange={setContactSheetOpen}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetClose />
            <SheetTitle>Who&apos;s your contact at {pendingClientOrg?.name}?</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {rosterLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-[var(--stage-text-tertiary)]" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {roster.map((c) => (
                  <button
                    key={c.entity_id}
                    type="button"
                    disabled={adding}
                    onClick={() => pendingClientOrg && handleConfirmBillTo(pendingClientOrg, c.entity_id)}
                    className="w-full text-left border border-[oklch(1_0_0_/_0.10)] bg-[oklch(1_0_0_/_0.03)] px-4 py-3 text-sm hover:bg-[var(--stage-accent-muted)] transition-colors focus:outline-none"
                    style={{ borderRadius: 'var(--stage-radius-panel)' }}
                  >
                    <span className="stage-readout">{c.display_name}</span>
                    {c.email && <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">{c.email}</p>}
                  </button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={adding}
                  onClick={() => pendingClientOrg && handleConfirmBillTo(pendingClientOrg, null)}
                  className="mt-2 text-[var(--stage-text-secondary)]"
                >
                  {adding ? 'Adding…' : 'Skip — add org only'}
                </Button>
              </div>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

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

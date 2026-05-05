'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { networkQueries } from '@/features/network-data/api/queries';
import { useWorkspace } from '@/shared/ui/providers/WorkspaceProvider';
import { motion } from 'framer-motion';
import { Plus, Building2, ChevronRight, X, User, Pencil, Loader2, MapPin, Network } from 'lucide-react';
import { OmniSearch } from '@/widgets/network-stream';
import { NetworkDetailSheet } from '@/widgets/network-detail';
import type { NetworkSearchOrg, NodeDetail } from '@/features/network-data';
import { getNodeForSheet, getCoupleEntityForEdit, getIndividualEntityForEdit, type CoupleEntityForEdit, type IndividualEntityForEdit } from '../actions/get-node-for-sheet';
import {
  addDealStakeholder,
  removeDealStakeholder,
  getOrgRosterForStakeholder,
  createContactForOrg,
  type DealStakeholderDisplay,
  type OrgRosterContact,
} from '../actions/deal-stakeholders';
import {
  getStakeholderRoleLabel,
  type DealStakeholderRole,
} from '../lib/stakeholder-roles';
import type { DealClientContext } from '../actions/get-deal-client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, SheetBody } from '@/shared/ui/sheet';
import { Button } from '@/shared/ui/button';
import { FloatingLabelInput } from '@/shared/ui/floating-label-input';
import { CoupleEditSheet } from './couple-edit-sheet';
import { IndividualEditSheet } from './individual-edit-sheet';
import { reclassifyClientEntity, type ClientEntityType } from '../actions/reclassify-client-entity';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { toast } from 'sonner';

const ROLES: DealStakeholderRole[] = ['bill_to', 'planner', 'venue_contact', 'vendor'];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';
}

function EntityIcon({ entityType }: { entityType: string | null }) {
  if (entityType === 'person' || entityType === 'couple') {
    return <User className="size-5" />;
  }
  if (entityType === 'venue') {
    return <MapPin className="size-5" />;
  }
  return <Building2 className="size-5" />;
}

type StakeholderGridProps = {
  dealId: string;
  sourceOrgId: string | null;
  stakeholders: DealStakeholderDisplay[];
  /** Legacy client (from deal.organization_id) when no bill_to stakeholder yet. */
  client: DealClientContext | null;
  onStakeholdersChange: () => void;
  compact?: boolean;
};

export function StakeholderGrid({
  dealId,
  sourceOrgId,
  stakeholders,
  client,
  onStakeholdersChange,
  compact = true,
}: StakeholderGridProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { workspaceId } = useWorkspace();

  // Hover prefetch for the linked-client card (and any other Network-detail
  // entry points in this grid). Same 150ms intent-delay pattern as the orbit
  // view; perf-patterns.md §4.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNodePrefetch = useCallback(
    (nodeId: string, kind: 'internal_employee' | 'extended_team' | 'external_partner') => {
      if (!workspaceId || !sourceOrgId) return;
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        queryClient.prefetchQuery(
          networkQueries.nodeDetail(workspaceId, nodeId, kind, sourceOrgId),
        );
      }, 150);
    },
    [queryClient, workspaceId, sourceOrgId],
  );
  const handleNodePrefetchCancel = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);
  const [omniOpen, setOmniOpen] = useState(false);
  const [setupHintOpen, setSetupHintOpen] = useState(false);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [roleSheetOpen, setRoleSheetOpen] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [pendingOrg, setPendingOrg] = useState<NetworkSearchOrg | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [roster, setRoster] = useState<OrgRosterContact[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [selectedRole, setSelectedRole] = useState<DealStakeholderRole>('planner');
  const [adding, setAdding] = useState(false);
  const [addContactForm, setAddContactForm] = useState({ firstName: '', lastName: '', email: '' });
  const [addingContact, setAddingContact] = useState(false);

  const billTo = stakeholders.find((s) => s.role === 'bill_to') ?? null;
  const others = stakeholders.filter((s) => s.role !== 'bill_to');
  const hasLegacyClient = !billTo && client?.organization;

  // NetworkDetailSheet state (for cortex-linked entities)
  const [sheetDetails, setSheetDetails] = useState<NodeDetail | null>(null);
  const [loadingRelId, setLoadingRelId] = useState<string | null>(null);

  const handleEditClick = async (relationshipId: string) => {
    setLoadingRelId(relationshipId);
    const details = await getNodeForSheet(relationshipId);
    setLoadingRelId(null);
    if (details) setSheetDetails(details);
  };

  // CoupleEditSheet state
  const [coupleEdit, setCoupleEdit] = useState<{
    open: boolean;
    entityId: string;
    initialValues: CoupleEntityForEdit;
  } | null>(null);
  const [loadingCoupleId, setLoadingCoupleId] = useState<string | null>(null);

  const handleCoupleEditClick = async (entityId: string) => {
    setLoadingCoupleId(entityId);
    const coupleData = await getCoupleEntityForEdit(entityId);
    setLoadingCoupleId(null);
    if (coupleData) {
      setCoupleEdit({ open: true, entityId, initialValues: coupleData });
    } else {
      toast.error('Could not load couple details.');
    }
  };

  // IndividualEditSheet state
  const [individualEdit, setIndividualEdit] = useState<{
    open: boolean;
    entityId: string;
    initialValues: IndividualEntityForEdit;
  } | null>(null);
  const [loadingIndividualId, setLoadingIndividualId] = useState<string | null>(null);

  const handleIndividualEditClick = async (entityId: string) => {
    setLoadingIndividualId(entityId);
    const data = await getIndividualEntityForEdit(entityId);
    setLoadingIndividualId(null);
    if (data) {
      setIndividualEdit({ open: true, entityId, initialValues: data });
    } else {
      toast.error('Could not load client details.');
    }
  };

  // Reclassify client type
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null);
  const [reclassifySheet, setReclassifySheet] = useState<{ entityId: string; currentType: string } | null>(null);

  const handleReclassify = async (entityId: string, newType: ClientEntityType) => {
    setReclassifyingId(entityId);
    const result = await reclassifyClientEntity(entityId, newType);
    setReclassifyingId(null);
    if (result.success) {
      setReclassifySheet(null);
      toast.success(`Client type changed to ${newType}.`);
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  // Return path for the "Edit full page" button inside the sheet
  const selectedId = searchParams.get('selected');
  const streamMode = searchParams.get('stream') ?? 'inquiry';
  const crmReturnPath = selectedId
    ? `/events?selected=${selectedId}&stream=${streamMode}`
    : '/events';

  const handleAddConnection = () => {
    if (sourceOrgId) {
      setOmniOpen(true);
    } else {
      setSetupHintOpen(true);
    }
  };

  const handleSelectOrg = (org: NetworkSearchOrg) => {
    setPendingOrg(org);
    setOmniOpen(false);
    setSelectedContact(null);

    // Only ask "who's your contact?" for company-type entities.
    // Individuals, couples, and venues are a single node — no contact picker needed.
    const isCompany = !org.entity_type || org.entity_type === 'company' || org.entity_type === 'venue_company';
    if (isCompany) {
      setContactSheetOpen(true);
      setRosterLoading(true);
      // Prefer entity_uuid for roster lookup (avoids legacy_org_id mismatch)
      getOrgRosterForStakeholder(org.entity_uuid ?? org.id).then((list) => {
        setRoster(list);
        setRosterLoading(false);
      });
    } else {
      // Person / couple — go straight to role picker
      setRoleSheetOpen(true);
    }
  };

  const handleSelectContact = (entityId: string) => {
    setSelectedContact(entityId);
    setContactSheetOpen(false);
    setRoleSheetOpen(true);
  };

  const handleSkipContact = () => {
    setSelectedContact(null);
    setContactSheetOpen(false);
    setRoleSheetOpen(true);
  };

  const handleAddNewContactOpen = () => {
    setAddContactForm({ firstName: '', lastName: '', email: '' });
    setAddContactOpen(true);
  };

  const handleAddNewContactSubmit = async () => {
    if (!pendingOrg) return;
    const { firstName, lastName, email } = addContactForm;
    if (!email.trim().includes('@')) {
      toast.error('Valid email required.');
      return;
    }
    setAddingContact(true);
    const result = await createContactForOrg(pendingOrg.id, {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim(),
    });
    setAddingContact(false);
    if (result.success) {
      setAddContactOpen(false);
      setSelectedContact(result.entityId);
      setRoleSheetOpen(true);
      toast.success('Contact added.');
    } else {
      toast.error(result.error);
    }
  };

  const handleConfirmRole = async () => {
    if (!pendingOrg) return;
    setAdding(true);
    const result = await addDealStakeholder(dealId, selectedRole, {
      organizationId: pendingOrg.id,
      entityId: selectedContact ?? undefined,
      isPrimary: selectedRole === 'bill_to',
    });
    setAdding(false);
    setRoleSheetOpen(false);
    setPendingOrg(null);
    setSelectedContact(null);
    if (result.success) {
      const who = selectedContact ? roster.find((r) => r.entity_id === selectedContact)?.display_name ?? pendingOrg.name : pendingOrg.name;
      toast.success(`${who} added as ${getStakeholderRoleLabel(selectedRole)}.`);
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleRemove = async (stakeholderId: string) => {
    const result = await removeDealStakeholder(dealId, stakeholderId);
    if (result.success) {
      toast.success('Connection removed.');
      onStakeholdersChange();
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const cardClass = cn(
    'w-full text-left rounded-2xl border border-[oklch(1_0_0_/_0.10)] overflow-hidden',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
    compact ? 'stage-panel p-3' : 'stage-panel p-4',
  );

  /** Render edit button for a stakeholder — handles cortex-linked orgs, individual, and couple entities */
  const renderEditButton = (s: DealStakeholderDisplay) => {
    // organization_id holds the entity UUID for individual/couple ghost entities too
    const entityId = s.organization_id;
    const isCouple = s.entity_type === 'couple';
    const isIndividual = s.entity_type === 'person';
    const isLoadingThis =
      loadingRelId === s.relationship_id ||
      loadingCoupleId === entityId ||
      loadingIndividualId === entityId;

    if (isCouple && entityId) {
      return (
        <button
          type="button"
          disabled={isLoadingThis}
          onClick={() => handleCoupleEditClick(entityId)}
          className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-colors disabled:opacity-45"
          aria-label={`Edit ${s.contact_name ?? s.name}`}
        >
          {isLoadingThis
            ? <Loader2 className="size-4 animate-spin" />
            : <Pencil className="size-4" />}
        </button>
      );
    }

    if (isIndividual && entityId) {
      return (
        <button
          type="button"
          disabled={isLoadingThis}
          onClick={() => handleIndividualEditClick(entityId)}
          className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-colors disabled:opacity-45"
          aria-label={`Edit ${s.name}`}
        >
          {isLoadingThis
            ? <Loader2 className="size-4 animate-spin" />
            : <Pencil className="size-4" />}
        </button>
      );
    }

    if (s.relationship_id) {
      return (
        <button
          type="button"
          disabled={!!loadingRelId}
          onClick={() => handleEditClick(s.relationship_id!)}
          className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-colors disabled:opacity-45"
          aria-label={`Edit ${s.contact_name ?? s.name}`}
        >
          {loadingRelId === s.relationship_id
            ? <Loader2 className="size-4 animate-spin" />
            : <Pencil className="size-4" />}
        </button>
      );
    }

    // Ghost company — pencil opens the type-change sheet (edit + switch type)
    if (entityId) {
      return (
        <button
          type="button"
          onClick={() => setReclassifySheet({ entityId, currentType: s.entity_type ?? 'company' })}
          className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-colors"
          aria-label={`Edit ${s.name}`}
        >
          <Pencil className="size-4" />
        </button>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="stage-label mb-1">
        Stakeholders
      </p>

      {/* Bill-To (primary) or legacy client */}
      {(billTo || hasLegacyClient) && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
          className="space-y-1"
        >
          <p className="stage-label">
            Client
          </p>
          {billTo ? (
            <div className={cn('flex items-center gap-3', cardClass)}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] font-medium text-sm tracking-tight">
                {initials(billTo.contact_name ?? billTo.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
                    {billTo.contact_name ?? billTo.name}
                  </p>
                  {billTo.relationship_id && (
                    <Network className="size-3 shrink-0 text-[var(--stage-text-secondary)]/50" aria-label="Linked network entity" />
                  )}
                </div>
                {billTo.organization_name && (
                  <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">{billTo.organization_name}</p>
                )}
                {billTo.email && !billTo.organization_name && (
                  <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">{billTo.email}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {renderEditButton(billTo)}
                <button
                  type="button"
                  onClick={() => handleRemove(billTo.id)}
                  className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-colors"
                  aria-label="Remove"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          ) : hasLegacyClient && client ? (
            client.relationshipId ? (
              <Link
                href={`/events?nodeId=${client.relationshipId}&kind=external_partner`}
                className={cn('flex items-center gap-3', cardClass)}
                onMouseEnter={() => handleNodePrefetch(client.relationshipId!, 'external_partner')}
                onMouseLeave={handleNodePrefetchCancel}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] font-medium text-sm tracking-tight">
                  {initials(client.organization.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
                    {client.organization.name || 'Client'}
                  </p>
                  {client.mainContact && (
                    <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">
                      {[client.mainContact.first_name, client.mainContact.last_name].filter(Boolean).join(' ')}
                      {client.mainContact.email ? ` · ${client.mainContact.email}` : ''}
                    </p>
                  )}
                </div>
                <ChevronRight className="size-4 text-[var(--stage-text-secondary)] shrink-0" />
              </Link>
            ) : (
              <div className={cn('flex items-center gap-3', cardClass)}>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] font-medium text-sm tracking-tight">
                  {initials(client.organization.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
                    {client.organization.name || 'Client'}
                  </p>
                  {client.mainContact && (
                    <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">
                      {[client.mainContact.first_name, client.mainContact.last_name].filter(Boolean).join(' ')}
                      {client.mainContact.email ? ` · ${client.mainContact.email}` : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          ) : null}
        </motion.div>
      )}

      {/* Connections — Planner / Venue / Vendor (no group header; role shown per card) */}
      {others.map((s) => (
        <motion.div
          key={s.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={STAGE_LIGHT}
          className={cn('flex items-center gap-3', cardClass)}
        >
          {s.logo_url ? (
            <img
              src={s.logo_url}
              alt=""
              className="size-10 shrink-0 rounded-xl object-cover bg-[oklch(1_0_0_/_0.05)]"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]">
              <EntityIcon entityType={s.entity_type} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <p className="font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
                {s.contact_name ?? s.name}
              </p>
              {s.relationship_id && (
                <Network className="size-3 shrink-0 text-[var(--stage-text-secondary)]/50" aria-label="Linked network entity" />
              )}
            </div>
            {s.organization_name && (
              <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">{s.organization_name}</p>
            )}
            <span className="inline-block mt-1 text-field-label font-medium text-[var(--stage-text-secondary)]/80 bg-[oklch(1_0_0_/_0.05)] border border-[oklch(1_0_0_/_0.10)] rounded-md px-1.5 py-0.5 leading-none">
              {getStakeholderRoleLabel(s.role)}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {renderEditButton(s)}
            <button
              type="button"
              onClick={() => handleRemove(s.id)}
              className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-colors"
              aria-label="Remove"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      ))}

      {/* Add Connection */}
      <button
        type="button"
        onClick={handleAddConnection}
        className={cn(
          'w-full rounded-2xl border-2 border-dashed border-[oklch(1_0_0_/_0.15)]',
          'flex items-center gap-3 text-left transition-colors',
          'hover:border-[var(--stage-accent)]/40 hover:bg-[var(--stage-accent-muted)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
          compact ? 'stage-panel-nested p-3' : 'stage-panel-nested p-4'
        )}
        aria-label="Add connection"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--stage-accent-muted)] text-[var(--stage-accent)]">
          <Plus className="size-5" strokeWidth={1.5} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--stage-text-primary)] tracking-tight">Add connection</p>
          <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">
            {sourceOrgId ? 'Search Network and assign role' : 'Set up Network to add connections'}
          </p>
        </div>
      </button>

      {sourceOrgId && (
        <OmniSearch
          sourceOrgId={sourceOrgId}
          open={omniOpen}
          onOpenChange={setOmniOpen}
          onSelectExisting={async (org) => handleSelectOrg(org)}
        />
      )}

      <Sheet open={setupHintOpen} onOpenChange={setSetupHintOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-0">
          <SheetHeader className="border-b border-[oklch(1_0_0_/_0.10)] px-6 py-5">
            <SheetTitle>Add connection</SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            <p className="text-sm text-[var(--stage-text-secondary)] leading-relaxed">
              Set up your organization in Network first. Then you can search your rolodex and assign roles (Bill-To, Planner, Venue, Vendor) to this deal.
            </p>
            <Button asChild className="w-full rounded-xl bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/30">
              <Link href="/network" className="inline-flex items-center justify-center gap-2">
                Go to Network
                <ChevronRight className="size-4" />
              </Link>
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Point of Contact — company orgs only */}
      <Sheet open={contactSheetOpen} onOpenChange={setContactSheetOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-0">
          <SheetHeader className="border-b border-[oklch(1_0_0_/_0.10)] px-6 py-5">
            <SheetTitle>
              Who&apos;s your contact at {pendingOrg?.name ?? 'this company'}?
            </SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            {pendingOrg && roster.length === 0 && !rosterLoading && (
              <p className="text-sm text-[var(--stage-text-secondary)]">
                No contacts on file yet. Add one or skip.
              </p>
            )}
            {rosterLoading ? (
              <p className="text-sm text-[var(--stage-text-secondary)]">Loading contacts…</p>
            ) : (
              <>
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {roster.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => handleSelectContact(c.entity_id)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors',
                        'border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)] hover:border-[var(--stage-accent)]/30'
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]">
                        <User className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-[var(--stage-text-primary)] tracking-tight truncate">{c.display_name}</p>
                        {c.email && <p className="text-xs text-[var(--stage-text-secondary)] truncate">{c.email}</p>}
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddNewContactOpen}
                  className="w-full rounded-xl border-dashed border-[oklch(1_0_0_/_0.20)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[var(--stage-accent)]/40"
                >
                  + Add new contact to {pendingOrg?.name ?? 'organization'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleSkipContact}
                  className="w-full rounded-xl text-[var(--stage-text-secondary)]"
                >
                  Skip (no contact)
                </Button>
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* Add New Contact to org (Ghost Forge lightweight) */}
      <Sheet open={addContactOpen} onOpenChange={setAddContactOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-0">
          <SheetHeader className="border-b border-[oklch(1_0_0_/_0.10)] px-6 py-5">
            <SheetTitle>
              Add contact to {pendingOrg?.name ?? 'organization'}
            </SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            <FloatingLabelInput
              label="First name"
              value={addContactForm.firstName}
              onChange={(e) => setAddContactForm((p) => ({ ...p, firstName: e.target.value }))}
              className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
            />
            <FloatingLabelInput
              label="Last name"
              value={addContactForm.lastName}
              onChange={(e) => setAddContactForm((p) => ({ ...p, lastName: e.target.value }))}
              className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
            />
            <FloatingLabelInput
              label="Email"
              type="email"
              value={addContactForm.email}
              onChange={(e) => setAddContactForm((p) => ({ ...p, email: e.target.value }))}
              required
              className="bg-[oklch(1_0_0_/_0.05)] border-[oklch(1_0_0_/_0.08)]"
            />
            <Button
              onClick={handleAddNewContactSubmit}
              disabled={addingContact || !addContactForm.email.trim().includes('@')}
              className="w-full rounded-xl bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/30"
            >
              {addingContact ? 'Adding…' : 'Add contact'}
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>

      {/* NetworkDetailSheet for cortex-linked entities */}
      {sheetDetails && sourceOrgId && (
        <NetworkDetailSheet
          details={sheetDetails}
          sourceOrgId={sourceOrgId}
          onClose={() => setSheetDetails(null)}
        />
      )}

      {/* CoupleEditSheet */}
      {coupleEdit && (
        <CoupleEditSheet
          open={coupleEdit.open}
          onOpenChange={(open) => {
            if (!open) setCoupleEdit(null);
            else setCoupleEdit((prev) => prev ? { ...prev, open: true } : null);
          }}
          entityId={coupleEdit.entityId}
          initialValues={coupleEdit.initialValues}
          onSaved={() => {
            onStakeholdersChange();
            router.refresh();
          }}
          onChangeType={async (newType) => {
            const result = await reclassifyClientEntity(coupleEdit.entityId, newType);
            if (result.success) {
              toast.success(`Client type changed to ${newType}.`);
              onStakeholdersChange();
              router.refresh();
            } else {
              toast.error(result.error);
            }
          }}
        />
      )}

      {/* IndividualEditSheet */}
      {individualEdit && (
        <IndividualEditSheet
          open={individualEdit.open}
          onOpenChange={(open) => {
            if (!open) setIndividualEdit(null);
            else setIndividualEdit((prev) => prev ? { ...prev, open: true } : null);
          }}
          entityId={individualEdit.entityId}
          initialValues={individualEdit.initialValues}
          onSaved={() => {
            onStakeholdersChange();
            router.refresh();
          }}
          onChangeType={async (newType) => {
            const result = await reclassifyClientEntity(individualEdit.entityId, newType);
            if (result.success) {
              toast.success(`Client type changed to ${newType}.`);
              onStakeholdersChange();
              router.refresh();
            } else {
              toast.error(result.error);
            }
          }}
        />
      )}

      {/* Reclassify client type sheet */}
      <Sheet open={!!reclassifySheet} onOpenChange={(open) => { if (!open) setReclassifySheet(null); }}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-0">
          <SheetHeader className="border-b border-[oklch(1_0_0_/_0.10)] px-6 py-5">
            <SheetTitle>Edit client</SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-3 px-6 py-5">
            <p className="text-xs text-[var(--stage-text-secondary)]/70">
              Switch to the type that best describes this client. Their deals and proposals are unchanged.
            </p>
            {(['company', 'person', 'couple'] as ClientEntityType[]).map((t) => {
              const isCurrent = reclassifySheet?.currentType === t;
              const isLoading = reclassifyingId === reclassifySheet?.entityId;
              const labels: Record<ClientEntityType, string> = {
                company: 'Company / Organisation',
                person: 'Individual',
                couple: 'Couple / Duo',
              };
              return (
                <button
                  key={t}
                  type="button"
                  disabled={isCurrent || isLoading}
                  onClick={() => reclassifySheet && handleReclassify(reclassifySheet.entityId, t)}
                  className={cn(
                    'w-full rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors',
                    isCurrent
                      ? 'border-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] cursor-default'
                      : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-card)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.10)] hover:text-[var(--stage-text-primary)]'
                  )}
                >
                  {isLoading && !isCurrent ? <Loader2 className="size-4 animate-spin inline mr-2" /> : null}
                  {labels[t]}
                  {isCurrent && <span className="ml-2 text-xs text-[var(--stage-text-secondary)]">(current)</span>}
                </button>
              );
            })}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <Sheet open={roleSheetOpen} onOpenChange={setRoleSheetOpen}>
        <SheetContent side="center" className="flex flex-col max-w-sm border-l border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] p-0">
          <SheetHeader className="border-b border-[oklch(1_0_0_/_0.10)] px-6 py-5">
            <SheetTitle>
              What is their role?
            </SheetTitle>
            <SheetClose />
          </SheetHeader>
          <SheetBody className="flex flex-col gap-4 px-6 py-5">
            {pendingOrg && (
              <p className="text-sm text-[var(--stage-text-secondary)]">
                Adding <span className="font-medium text-[var(--stage-text-primary)]">{pendingOrg.name}</span>
                {selectedContact && roster.find((r) => r.entity_id === selectedContact) && (
                  <> · <span className="font-medium text-[var(--stage-text-primary)]">{roster.find((r) => r.entity_id === selectedContact)?.display_name}</span></>
                )}{' '}
                to this deal.
              </p>
            )}
            <div className="space-y-2">
              {ROLES.map((role) => (
                <label
                  key={role}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors',
                    selectedRole === role
                      ? 'border-[var(--stage-accent)]/50 bg-[var(--stage-accent-muted)]'
                      : 'border-[oklch(1_0_0_/_0.10)] hover:bg-[oklch(1_0_0_/_0.05)]'
                  )}
                >
                  <input
                    type="radio"
                    name="stakeholder-role"
                    value={role}
                    checked={selectedRole === role}
                    onChange={() => setSelectedRole(role)}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium text-[var(--stage-text-primary)]">{getStakeholderRoleLabel(role)}</span>
                </label>
              ))}
            </div>
            <Button
              onClick={handleConfirmRole}
              disabled={adding}
              className="w-full rounded-xl bg-[var(--stage-accent)]/20 text-[var(--stage-accent)] hover:bg-[var(--stage-accent)]/30"
            >
              {adding ? 'Adding…' : 'Add'}
            </Button>
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
